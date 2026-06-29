# Express + NamoID quickstart

A minimal Express app that signs users in with NamoID using `openid-client` —
OIDC discovery from the issuer URL, Authorization Code + PKCE, no hardcoded
endpoints.

## What you get

- `/` — public home page with a "Sign in with NamoID" button
- `/profile` — protected route, shows the validated `id_token` claims as JSON
- `/logout` — destroys the server session and returns you home

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3002/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/node-express
cp .env.example .env
```

Fill in the four `NAMOID_` vars and a `SESSION_SECRET`:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=<your client_id from step 1>
NAMOID_CLIENT_SECRET=<your client_secret from step 1>
NAMOID_REDIRECT_URI=http://localhost:3002/callback
SESSION_SECRET=<run: openssl rand -hex 32>
PORT=3002
```

### 3. Install + run

```bash
npm install
npm start
```

Open http://localhost:3002 → click **Sign in with NamoID** → authenticate on
namoid.in → land at `/profile` with your id_token claims.

## How it works

Everything lives in `app.js`:

- **`Issuer.discover(NAMOID_ISSUER)`** fetches
  `${NAMOID_ISSUER}/.well-known/openid-configuration` once at startup. The
  authorize / token / userinfo / jwks URLs come from discovery — we never
  hardcode them.
- **`/login`** uses `generators.codeVerifier()` / `generators.codeChallenge()`
  to build a PKCE pair (`code_challenge_method=S256`), plus a `state` and
  `nonce`. All three are stashed in the server session, then we 302 to
  `client.authorizationUrl(...)`.
- **`/callback`** calls `client.callback(redirectUri, params, { code_verifier,
  state, nonce })`, which exchanges the code (confidential client,
  `client_secret_basic`), verifies `state`/`nonce`, and validates the
  `id_token` signature and claims. We read `tokenSet.claims()` and save them to
  the session.
- Tokens and claims never leave the server session — the browser only holds a
  signed session cookie.

## Production deployment

Same setup, three swaps:

```env
NAMOID_CLIENT_ID=<prod client_id>
NAMOID_CLIENT_SECRET=<prod client_secret>
NAMOID_REDIRECT_URI=https://your-app.com/callback
```

Register `https://your-app.com/callback` as an additional redirect URI on the
client (or create a separate prod client), serve over HTTPS, and set
`NODE_ENV=production` so the session cookie is marked `Secure`.

## Troubleshooting

- **"Redirect URI mismatch"** — the URI registered on the OAuth client must be
  character-for-character identical to `NAMOID_REDIRECT_URI`
  (`http://localhost:3002/callback`).
- **`invalid_client`** — wrong `NAMOID_CLIENT_SECRET`, or the client isn't
  configured for `client_secret_basic` token-endpoint auth.
- **`iss` mismatch / "issuer did not match"** — `NAMOID_ISSUER` must exactly
  match the `iss` claim. Use the hosted issuer with **no trailing slash**
  (`https://<slug>.id.namoid.in`).
- **PKCE / `code_verifier` errors** — usually a lost session between `/login`
  and `/callback`. Make sure `SESSION_SECRET` is set and stable across
  restarts, and that cookies aren't being blocked.
