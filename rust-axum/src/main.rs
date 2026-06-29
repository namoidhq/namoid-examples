//! Sign in with NamoID (OAuth 2.1 + OIDC) from an axum app.
//!
//! Authorization Code + PKCE (S256, mandatory), discovery from the issuer,
//! confidential client (HTTP Basic at the token endpoint), id_token validation
//! including nonce. Endpoints are discovered — never hardcoded.

use std::env;
use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use openidconnect::core::{CoreClient, CoreProviderMetadata, CoreResponseType};
use openidconnect::reqwest::async_http_client;
use openidconnect::{
    AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    OAuth2TokenResponse, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope,
    TokenResponse,
};
use serde::{Deserialize, Serialize};
use tower_sessions::{MemoryStore, Session, SessionManagerLayer};

const SESSION_AUTH_KEY: &str = "auth_request";
const SESSION_CLAIMS_KEY: &str = "claims";

/// Shared application state: a fully configured OIDC client built from the
/// issuer's discovery document. Stateless across requests — all per-user data
/// lives in the session cookie store.
#[derive(Clone)]
struct AppState {
    client: Arc<CoreClient>,
}

/// In-flight authorization request, stored in the session between /login and
/// /callback so we can validate CSRF state and the id_token nonce, and supply
/// the PKCE verifier at code exchange.
#[derive(Clone, Serialize, Deserialize)]
struct AuthRequest {
    csrf_state: String,
    nonce: String,
    pkce_verifier: String,
}

/// The subset of OIDC claims we surface to the user.
#[derive(Clone, Serialize, Deserialize)]
struct UserClaims {
    subject: String,
    email: Option<String>,
    name: Option<String>,
}

#[tokio::main]
async fn main() {
    let issuer = env_var("NAMOID_ISSUER");
    let client_id = env_var("NAMOID_CLIENT_ID");
    let client_secret = env_var("NAMOID_CLIENT_SECRET");
    let redirect_uri = env_var("NAMOID_REDIRECT_URI");
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3010);

    // Discover endpoints (authorization, token, userinfo, jwks) from the issuer.
    let provider_metadata = CoreProviderMetadata::discover_async(
        IssuerUrl::new(issuer).expect("NAMOID_ISSUER must be a valid URL"),
        async_http_client,
    )
    .await
    .expect("OIDC discovery failed — check NAMOID_ISSUER");

    let client = CoreClient::from_provider_metadata(
        provider_metadata,
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
    )
    .set_redirect_uri(
        RedirectUrl::new(redirect_uri).expect("NAMOID_REDIRECT_URI must be a valid URL"),
    );

    let state = AppState {
        client: Arc::new(client),
    };

    let session_layer = SessionManagerLayer::new(MemoryStore::default());

    let app = Router::new()
        .route("/", get(home))
        .route("/login", get(login))
        .route("/callback", get(callback))
        .route("/profile", get(profile))
        .route("/logout", get(logout))
        .with_state(state)
        .layer(session_layer);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind listener");
    println!("NamoID axum quickstart listening on http://localhost:{port}");
    axum::serve(listener, app)
        .await
        .expect("server error");
}

fn env_var(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required env var: {name}"))
}

async fn home(session: Session) -> Html<String> {
    let signed_in = session
        .get::<UserClaims>(SESSION_CLAIMS_KEY)
        .await
        .ok()
        .flatten()
        .is_some();

    let cta = if signed_in {
        r#"<p>You are signed in. <a href="/profile">View your profile</a>.</p>"#.to_string()
    } else {
        r#"<p><a href="/login">Sign in with NamoID</a></p>"#.to_string()
    };

    Html(page(
        "NamoID + axum quickstart",
        &format!("<h1>NamoID + axum quickstart</h1>{cta}"),
    ))
}

async fn login(State(state): State<AppState>, session: Session) -> Result<Redirect, AppError> {
    // PKCE: S256 challenge/verifier pair (mandatory).
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, csrf_state, nonce) = state
        .client
        .authorize_url(
            AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    let auth_request = AuthRequest {
        csrf_state: csrf_state.secret().clone(),
        nonce: nonce.secret().clone(),
        pkce_verifier: pkce_verifier.secret().clone(),
    };
    session
        .insert(SESSION_AUTH_KEY, auth_request)
        .await
        .map_err(|_| AppError::session())?;

    Ok(Redirect::to(auth_url.as_str()))
}

#[derive(Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

async fn callback(
    State(app): State<AppState>,
    session: Session,
    Query(params): Query<CallbackParams>,
) -> Result<Redirect, AppError> {
    if let Some(error) = params.error {
        let desc = params.error_description.unwrap_or_default();
        return Err(AppError::new(format!(
            "authorization error from NamoID: {error} {desc}"
        )));
    }

    let code = params.code.ok_or_else(|| AppError::new("missing authorization code"))?;
    let returned_state = params.state.ok_or_else(|| AppError::new("missing state"))?;

    let auth_request: AuthRequest = session
        .get(SESSION_AUTH_KEY)
        .await
        .map_err(|_| AppError::session())?
        .ok_or_else(|| AppError::new("no in-flight auth request — start at /login"))?;

    // CSRF: the returned state must match what we issued.
    if returned_state != auth_request.csrf_state {
        return Err(AppError::new("CSRF state mismatch"));
    }

    // Exchange the code, supplying the PKCE verifier. The crate uses HTTP Basic
    // auth at the token endpoint for confidential clients automatically.
    let token_response = app
        .client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(PkceCodeVerifier::new(auth_request.pkce_verifier))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::new(format!("token exchange failed: {e}")))?;

    let id_token = token_response
        .id_token()
        .ok_or_else(|| AppError::new("no id_token in token response"))?;

    // Validate signature, issuer, audience, expiry, and nonce in one call.
    let nonce = Nonce::new(auth_request.nonce);
    let claims = id_token
        .claims(&app.client.id_token_verifier(), &nonce)
        .map_err(|e| AppError::new(format!("id_token verification failed: {e}")))?;

    let user = UserClaims {
        subject: claims.subject().to_string(),
        email: claims.email().map(|e| e.to_string()),
        name: claims
            .name()
            .and_then(|n| n.get(None))
            .map(|n| n.to_string()),
    };

    // Access token is available via `token_response.access_token()` if you want
    // to call the userinfo endpoint or other NamoID APIs. Not needed here.

    session
        .remove::<AuthRequest>(SESSION_AUTH_KEY)
        .await
        .map_err(|_| AppError::session())?;
    session
        .insert(SESSION_CLAIMS_KEY, user)
        .await
        .map_err(|_| AppError::session())?;

    Ok(Redirect::to("/profile"))
}

async fn profile(session: Session) -> Result<Html<String>, Response> {
    let claims = session
        .get::<UserClaims>(SESSION_CLAIMS_KEY)
        .await
        .ok()
        .flatten()
        .ok_or_else(|| Redirect::to("/login").into_response())?;

    let email = claims.email.unwrap_or_else(|| "—".to_string());
    let name = claims.name.unwrap_or_else(|| "—".to_string());

    let body = format!(
        r#"<h1>Profile</h1>
<table>
  <tr><td><strong>Subject</strong></td><td><code>{subject}</code></td></tr>
  <tr><td><strong>Name</strong></td><td>{name}</td></tr>
  <tr><td><strong>Email</strong></td><td>{email}</td></tr>
</table>
<p><a href="/logout">Sign out</a></p>"#,
        subject = html_escape(&claims.subject),
        name = html_escape(&name),
        email = html_escape(&email),
    );

    Ok(Html(page("Profile — NamoID axum quickstart", &body)))
}

async fn logout(session: Session) -> Redirect {
    let _ = session.delete().await;
    Redirect::to("/")
}

fn page(title: &str, body: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }}
  a {{ color: #4f46e5; }}
  table {{ border-collapse: collapse; }}
  td {{ padding: 0.25rem 1rem 0.25rem 0; }}
  code {{ background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 0.25rem; }}
</style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// A flat error type rendered as a 400 with a short message — enough to debug a
/// flow locally without leaking internals.
struct AppError(String);

impl AppError {
    fn new(message: impl Into<String>) -> Self {
        AppError(message.into())
    }

    fn session() -> Self {
        AppError("session store error".to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Html(page("Error", &format!("<h1>Sign-in error</h1><p>{}</p><p><a href=\"/\">Home</a></p>", html_escape(&self.0))))).into_response()
    }
}
