# Java (Spring Boot) + NamoID quickstart

Sign users in with NamoID using Spring Security's OAuth2 Client — `issuer-uri` discovery, Authorization Code + PKCE, and id_token validation handled for you.

## What you get

- `GET /` — home page: shows your name + email when signed in, a sign-in link when not.
- `GET /profile` — protected route returning your OIDC claims (`sub`, `email`, `name`) as JSON. Unauthenticated access redirects you to NamoID to sign in.
- Sign out — `POST /logout` clears the session.

## Run it locally (5 minutes)

### 1. Create an OAuth client in NamoID

Go to [https://namoid.in](https://namoid.in) → **Projects** → your project → **Applications** → **New application**.

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3008/login/oauth2/code/namoid` |
| Scopes | `openid`, `profile`, `email` |

Copy the **client_id**, the **one-time client secret**, and the **issuer URL**.

> Note the Spring-specific redirect path: Spring Security's default OAuth2 callback is `/login/oauth2/code/{registrationId}`, and this app uses registrationId `namoid` — so the redirect URI must end in `/login/oauth2/code/namoid`.

### 2. Configure this app

Set the four `NAMOID_` environment variables. The easiest way:

```bash
cp .env.example .env
# edit .env with your client_id / secret / issuer
set -a; source .env; set +a
```

Or export them directly:

```bash
export NAMOID_ISSUER="https://your-namoid-issuer/v1/oauth"
export NAMOID_CLIENT_ID="your-client-id"
export NAMOID_CLIENT_SECRET="your-client-secret"
export NAMOID_REDIRECT_URI="http://localhost:3008/login/oauth2/code/namoid"
```

Spring resolves the `${...}` placeholders in `application.yml` from these env vars.

### 3. Install + run

```bash
./mvnw spring-boot:run
# or, if you have Maven installed:
mvn spring-boot:run
```

Open [http://localhost:3008](http://localhost:3008).

## How it works

- **`application.yml` `issuer-uri` discovery** — pointing `spring.security.oauth2.client.provider.namoid.issuer-uri` at NamoID makes Spring fetch `/.well-known/openid-configuration` at startup and wire up the authorize, token, JWKS, and userinfo endpoints automatically.
- **`oauth2Login()`** — the `SecurityFilterChain` in `SecurityConfig.java` enables the Authorization Code login flow. Spring's default login entry point is `/oauth2/authorization/namoid`.
- **`OidcUser` principal** — after login the authenticated principal is an `OidcUser`. `HomeController` reads it with `@AuthenticationPrincipal` and calls `getFullName()`, `getEmail()`, `getSubject()` / `getClaims()`. Spring validates the id_token signature (via JWKS), issuer, audience, and expiry for you.
- **PKCE is automatic** — Spring Security sends PKCE (S256) automatically because NamoID advertises `S256` in `code_challenge_methods_supported`. This happens even for confidential clients (with a client secret) — do **not** disable it. If you ever needed to force it, you'd supply a custom `OAuth2AuthorizationRequestResolver` with `OAuth2AuthorizationRequestCustomizers.withPkce()`, but the default behavior is sufficient here.

## Production deployment

- Use your live NamoID credentials (separate from the local quickstart application).
- Register an HTTPS redirect URI: `https://your-app.com/login/oauth2/code/namoid`, and set `NAMOID_REDIRECT_URI` to match.
- Keep `NAMOID_CLIENT_SECRET` in your platform's secret store, never in source control (`.env` is gitignored).

## Troubleshooting

- **`redirect_uri` mismatch** — the redirect URI registered in NamoID must exactly match `NAMOID_REDIRECT_URI`, including the `/login/oauth2/code/namoid` path. This is Spring's default callback path; a common mistake is registering `http://localhost:3008/` or `/callback` instead.
- **`invalid_client`** — wrong `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`, or the secret was rotated. The secret is shown only once at creation; recreate the application if you lost it.
- **`iss` / issuer mismatch** — `NAMOID_ISSUER` must match the `iss` value NamoID puts in the id_token exactly, including any trailing slash (or lack of one). Copy it verbatim from the NamoID application page.
- **PKCE** — Spring sends it automatically when the provider advertises `S256`; you do not need to configure anything. If you disabled it, re-enable by removing the customization.
