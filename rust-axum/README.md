# Rust (axum) + NamoID quickstart

An axum app that signs users in with NamoID using the `openidconnect` crate —
OIDC discovery from the issuer, Authorization Code + PKCE (S256), and built-in
id_token validation. No hardcoded endpoints.

## What you get

- `/` — public landing page with a "Sign in with NamoID" link
- `/login` — builds the authorize URL (CSRF state + nonce + PKCE challenge),
  stashes them in the session, and redirects to NamoID
- `/callback` — verifies CSRF state, exchanges the code with the PKCE verifier,
  validates the id_token (signature, issuer, audience, expiry, nonce), and
  stores the claims
- `/profile` — protected route showing the signed-in user's subject, name, email
- `/logout` — clears the session and returns home
- Endpoints discovered via `CoreProviderMetadata::discover_async` — the
  authorize / token / userinfo / jwks URLs are never hardcoded

## Run it locally (5 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3010/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/rust-axum
cp .env.example .env
```

Edit `.env` with the four `NAMOID_` values from step 1, then load them into your
shell:

```bash
set -a; source .env; set +a
```

### 3. Install + run

```bash
cargo run
```

Open http://localhost:3010 → click **Sign in with NamoID** → authenticate on
namoid.in → land at `/profile` with your claims.

## How it works (`src/main.rs`)

- **Discovery** — at startup, `CoreProviderMetadata::discover_async(issuer, …)`
  fetches `${NAMOID_ISSUER}/.well-known/openid-configuration`. A `CoreClient` is
  built from that metadata plus the `ClientId`, `ClientSecret`, and
  `RedirectUrl`. The client is shared via axum state; it holds no per-user data.
- **PKCE** — `/login` calls `PkceCodeChallenge::new_random_sha256()` and passes
  the challenge into `authorize_url(...)`. The verifier (plus the CSRF token and
  nonce) is stored in the session cookie.
- **Callback** — we check that the returned `state` matches the stored CSRF
  token, then `exchange_code(code).set_pkce_verifier(verifier)
  .request_async(async_http_client)`. The crate sends the client secret as HTTP
  Basic auth at the token endpoint (confidential client).
- **id_token verification** — `id_token.claims(&client.id_token_verifier(),
  &nonce)` validates the signature against the discovered JWKS, plus issuer,
  audience, expiry, and the nonce — all in one call. We read `subject()`,
  `email()`, and `name()` and store them in the session.

The access token is available via `token_response.access_token()` if you want to
call the userinfo endpoint or other NamoID APIs.

## Production deployment

Same setup, three swaps:

- Use a **prod** `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET` (distinct from dev).
- Set `NAMOID_REDIRECT_URI` to your **https** callback,
  e.g. `https://your-app.com/callback`.
- Register that https redirect on the same client (or a separate prod client).

Behind a TLS-terminating proxy, also serve the app over https end-to-end and set
secure session cookies (`tower-sessions` cookie options) so the session cookie is
only sent over https.

## Troubleshooting

- **`redirect_uri` mismatch** — `NAMOID_REDIRECT_URI` must be
  character-for-character identical to a redirect registered on the client,
  including scheme, host, port, and path (`http://localhost:3010/callback`).
- **`invalid_client`** — wrong `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`, or
  the secret was rotated. Copy a fresh secret from the application page.
- **`iss` mismatch / "id_token verification failed"** — `NAMOID_ISSUER` must
  exactly match the `iss` claim. Use the hosted issuer
  (`https://<slug>.id.namoid.in`) with **no trailing slash**.
- **"CSRF state mismatch" / nonce / PKCE errors** — these mean the session
  cookie was lost between `/login` and `/callback` (e.g. cookies disabled, or a
  server restart cleared the in-memory `MemoryStore`). Start over at `/login`;
  for multi-instance deployments swap `MemoryStore` for a shared store.
