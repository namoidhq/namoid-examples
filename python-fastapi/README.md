# FastAPI + NamoID quickstart

The shortest path from "I have a FastAPI app" to "users sign in with NamoID" —
FastAPI + Authlib as an OIDC client, auto-discovering everything from your
project's issuer URL and using Authorization Code + PKCE (S256). No hardcoded
endpoints.

## What you get

- `/` — public home page with a "Sign in with NamoID" button (or your name +
  "Sign out" once you're signed in)
- `/profile` — protected route, shows the OIDC claims NamoID returned
- `/logout` — clears the session and sends you home

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3004/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id` and the one-time `client_secret`, plus the project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/python-fastapi
cp .env.example .env
```

Edit `.env` and fill the four `NAMOID_` vars plus `SESSION_SECRET`:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=<your client_id from step 1>
NAMOID_CLIENT_SECRET=<your client_secret from step 1>
NAMOID_REDIRECT_URI=http://localhost:3004/callback
SESSION_SECRET=<run: openssl rand -hex 32>
```

### 3. Install + run

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py                     # or: uvicorn main:app --port 3004
```

Open http://localhost:3004 → click **Sign in with NamoID** → authenticate on
namoid.in → land on `/profile` with your claims.

## How it works

`main.py` is the entire integration:

- **`SessionMiddleware`** — signed cookie session (itsdangerous) that holds the
  PKCE/state during the round-trip and the user's claims afterwards.
- **`oauth.register(... server_metadata_url=...)`** — Authlib fetches
  `${NAMOID_ISSUER}/.well-known/openid-configuration` and learns the authorize,
  token, userinfo and JWKS endpoints. We never hardcode them. `code_challenge_method="S256"`
  turns on PKCE.
- **`authorize_redirect`** (in `/login`) — builds the authorization request
  (response_type=code, PKCE challenge, state) and redirects to NamoID.
- **`authorize_access_token`** (in `/callback`) — verifies state, exchanges the
  code with the PKCE verifier (confidential client, `client_secret_basic`), and
  validates the `id_token`. The user claims arrive in `token["userinfo"]`
  (`sub`, `email`, `email_verified`, `name`), which we stash in `request.session`.

## Production deployment

Same setup, three swaps:

```env
NAMOID_CLIENT_ID=<prod client_id>          # different from the dev one
NAMOID_CLIENT_SECRET=<prod client_secret>
NAMOID_REDIRECT_URI=https://your-app.com/callback
```

Register `https://your-app.com/callback` as a redirect URI on the client (or
create a separate prod client), and make sure your app is served over HTTPS so
the session cookie is sent securely.

## Troubleshooting

- **"Redirect URI mismatch"** — the URI registered on the OAuth client must be
  character-for-character identical to `NAMOID_REDIRECT_URI`
  (`http://localhost:3004/callback`).
- **`invalid_client`** — `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET` are wrong
  or belong to a different project. Copy them again from the application page.
- **`iss` / issuer mismatch** — `NAMOID_ISSUER` must exactly match the `iss`
  claim in the token. Use the project's hosted issuer
  (`https://<slug>.id.namoid.in`) with **no trailing slash**.
- **`mismatching_state` / CSRF or PKCE error** — the session cookie was lost
  between `/login` and `/callback`. This usually means `SESSION_SECRET` changed
  across a restart, or you opened `/callback` in a different browser. Pin
  `SESSION_SECRET` once (`openssl rand -hex 32`) and keep it stable.
- **`SessionMiddleware` errors** — `SESSION_SECRET` is required; the app won't
  start without it. Set it in `.env`.
