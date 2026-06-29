# Go + NamoID quickstart

The shortest path from "I have a Go HTTP server" to "users sign in with NamoID."

Stack: Go 1.22+ standard `net/http` + [`github.com/coreos/go-oidc/v3`](https://github.com/coreos/go-oidc)
(provider discovery + ID token verification) +
[`golang.org/x/oauth2`](https://pkg.go.dev/golang.org/x/oauth2)
(the OAuth 2.0 flow + PKCE). No hardcoded endpoints — everything is discovered
from the issuer URL.

## What you get

- `/` — public landing page with a "Sign in with NamoID" button
- `/login` — generates state + nonce + PKCE verifier, redirects to NamoID
- `/callback` — verifies state, exchanges the code (with PKCE), verifies the
  ID token signature + nonce, stores the session
- `/profile` — protected route, shows the verified ID token claims
- `/logout` — clears the session and sends you home

Login state (state / nonce / PKCE verifier) and the resulting session live in a
small in-memory map keyed by an `HttpOnly` cookie — easy to swap for Redis or a
signed cookie in production.

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3005/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → you'll see the `client_id` and a one-time `client_secret`. Copy both,
plus the **issuer URL** shown in the integration setup
(`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

Set the four `NAMOID_` env vars however you like. The simplest way is to copy
the example file and `source` it:

```bash
cd examples/go-oidc
cp .env.example .env
# edit .env with your client_id / client_secret / issuer
set -a; source .env; set +a
```

`set -a` exports every variable that the following `source` assigns, so
`os.Getenv` picks them up; `set +a` turns that back off. (Or just `export` each
one by hand — this app reads plain environment variables, it does not parse
`.env` itself.)

### 3. Install + run

```bash
go mod tidy     # download go-oidc + x/oauth2
go run .
```

Open http://localhost:3005 → click **Sign in with NamoID** → authenticate on
namoid.in → land on `/profile` with your verified claims.

## How it works (in `main.go`)

- **Discovery** — `oidc.NewProvider(ctx, NAMOID_ISSUER)` fetches
  `${NAMOID_ISSUER}/.well-known/openid-configuration` once at startup. The
  authorize / token / userinfo / JWKS URLs come from there; we never hardcode
  them. `provider.Endpoint()` feeds the `oauth2.Config`.
- **PKCE (mandatory)** — `/login` calls `oauth2.GenerateVerifier()`, sends the
  S256 challenge on the authorize request via `oauth2.S256ChallengeOption(...)`,
  and replays the verifier on the token exchange via
  `oauth2.VerifierOption(...)`. The verifier is stashed in the login cookie's
  server-side state, never sent to the browser.
- **ID token verification** — after `oauth2Config.Exchange(...)`, we pull
  `token.Extra("id_token")` and run it through
  `provider.Verifier(&oidc.Config{ClientID: clientID}).Verify(ctx, rawIDToken)`,
  which checks the RS256 signature against NamoID's JWKS, the `iss`, the
  `aud`, and expiry. Then we compare the `nonce` claim against the one we
  generated. Only then do we trust the claims.
- **userinfo (optional)** — `provider.UserInfo(ctx, oauth2.StaticTokenSource(token))`
  enriches the profile; failures here are non-fatal because the ID token
  already carries what we need.

That's the entire integration. A real app would persist the user in a database,
keep the access token to call NamoID APIs, and refresh tokens as they expire.

## Production deployment

Same code, a few swaps:

```env
NAMOID_CLIENT_ID=<prod client_id>          # different from the dev one
NAMOID_CLIENT_SECRET=<prod client_secret>
NAMOID_REDIRECT_URI=https://your-app.com/callback
```

- Register `https://your-app.com/callback` as a redirect URI on the prod client
  (or create a separate prod client).
- Serve over HTTPS — the cookies in this example flip to `Secure` automatically
  when the request arrives over TLS.
- Replace the in-memory session map with Redis or signed cookies so sessions
  survive restarts and work across multiple instances.

## Troubleshooting

- **"Redirect URI mismatch"** — `NAMOID_REDIRECT_URI` must be
  character-for-character identical to a redirect URI registered on the OAuth
  client. `http://localhost:3005/callback`, no trailing slash, no `https`.
- **`invalid_client` on token exchange** — wrong `NAMOID_CLIENT_ID` /
  `NAMOID_CLIENT_SECRET`, or the secret was rotated. The secret is shown only
  once at creation; generate a new one if you lost it.
- **`iss` / issuer mismatch at startup or verify** — `NAMOID_ISSUER` must
  exactly match the `iss` claim NamoID puts in tokens. Use the project's hosted
  issuer (`https://<slug>.id.namoid.in`), with **no trailing slash**.
- **"state mismatch" / "nonce mismatch" / PKCE errors** — usually a stale or
  missing `namoid_login` cookie (e.g. you opened `/callback` directly, or the
  10-minute login window expired). Start the flow again at `/login`.
