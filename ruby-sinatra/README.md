# Ruby (Sinatra) + NamoID quickstart

A minimal Sinatra app that signs users in with NamoID using the `openid_connect`
gem — OIDC discovery from the issuer, Authorization Code + PKCE (S256), no
hardcoded endpoints.

## What you get

- `/` — public home page with a "Sign in with NamoID" button
- `/login` — generates state + nonce + PKCE verifier, redirects to NamoID's authorize endpoint
- `/callback` — verifies state, exchanges the code (with PKCE verifier) for tokens, validates the `id_token`
- `/profile` — protected route, renders the OIDC claims as JSON
- `/logout` — clears the session
- Endpoints (authorize / token / userinfo / jwks) are auto-discovered from the issuer

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3006/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/ruby-sinatra
cp .env.example .env
```

Edit `.env` and fill in the four `NAMOID_` vars plus `SESSION_SECRET`:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=<your client_id from step 1>
NAMOID_CLIENT_SECRET=<your client_secret from step 1>
NAMOID_REDIRECT_URI=http://localhost:3006/callback
SESSION_SECRET=<run: openssl rand -hex 32>
```

### 3. Install + run

```bash
bundle install
ruby app.rb          # or: bundle exec rackup -p 3006
```

Open http://localhost:3006 → click **Sign in with NamoID** → authenticate on
namoid.in → land at `/profile` with your claims.

## How it works (app.rb)

- **Discovery** — `OpenIDConnect::Discovery::Provider::Config.discover!(ISSUER)`
  fetches `<issuer>/.well-known/openid-configuration` once. The authorize,
  token, userinfo, and JWKS URLs all come from that document; nothing is
  hardcoded.
- **PKCE** — `/login` creates a `code_verifier`
  (`SecureRandom.urlsafe_base64(64)`) and sends its S256 `code_challenge`
  (`Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false)`)
  plus `code_challenge_method=S256` on the authorize request. The verifier is
  stored in the session and replayed on the token request.
- **Token exchange** — `/callback` verifies `state`, then POSTs to the
  discovered token endpoint as a confidential client
  (`client_secret_basic` via HTTP Basic auth) with the `code` and
  `code_verifier`.
- **id_token validation** — `OpenIDConnect::ResponseObject::IdToken.decode`
  verifies the signature against the discovered JWKS, and `verify!` checks
  `iss`, `aud` (client_id), `exp`, and the `nonce` we generated at `/login`.
  Claims are then read from `userinfo` (with the access token) and stored in
  the Sinatra session.

## Production deployment

Same setup, three swaps:

- Use **live** `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET` (separate from dev).
- Set `NAMOID_REDIRECT_URI` to your HTTPS URL, e.g.
  `https://your-app.com/callback`, and register that exact URI on the OAuth
  client (or create a separate prod client).
- Set a stable `SESSION_SECRET` and serve over HTTPS so the session cookie is
  protected.

## Troubleshooting

- **"Redirect URI mismatch"** — `NAMOID_REDIRECT_URI` must be
  character-for-character identical to a redirect URI registered on the OAuth
  client (`http://localhost:3006/callback` for local dev).
- **`invalid_client` at the token endpoint** — wrong `NAMOID_CLIENT_ID` /
  `NAMOID_CLIENT_SECRET`, or the client isn't configured as confidential. This
  app authenticates with `client_secret_basic` (HTTP Basic).
- **`iss` mismatch / "Invalid id_token"** — `NAMOID_ISSUER` must exactly match
  the `iss` claim. Use the project's hosted issuer
  (`https://<slug>.id.namoid.in`, **no trailing slash**).
- **State / nonce / PKCE errors** — these live in the Sinatra cookie session.
  Make sure `SESSION_SECRET` is set and stable, and that you start the flow at
  `/login` (which seeds them) rather than hitting `/callback` directly.
