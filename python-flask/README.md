# Flask + NamoID quickstart

A minimal Flask app that signs users in with NamoID using Authlib — endpoints are auto-discovered from the issuer and the Authorization Code flow is protected with PKCE (S256).

## What you get

- `/` — public home page with a "Sign in with NamoID" button (or your name + a sign-out link when logged in)
- `/profile` — protected route that shows the OIDC claims (`sub`, `email`, `name`, …) returned by NamoID
- `/logout` — clears the session and returns you to `/`

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New application.

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3003/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cp .env.example .env
```

Fill in the four `NAMOID_` vars from step 1, then generate a Flask secret key:

```bash
python -c "import secrets;print(secrets.token_hex(32))"
```

Paste the result into `FLASK_SECRET_KEY`.

### 3. Install + run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:3003 → click **Sign in with NamoID** → authenticate → land on `/profile` with your claims.

## How it works

The entire integration lives in `app.py`:

- **`oauth.register(..., server_metadata_url=f"{NAMOID_ISSUER}/.well-known/openid-configuration", ...)`** — Authlib fetches the OIDC discovery document, so the authorize / token / JWKS / userinfo endpoints are never hardcoded. `client_kwargs` sets the scope and `code_challenge_method=S256`, which turns on PKCE.
- **`oauth.namoid.authorize_redirect(NAMOID_REDIRECT_URI)`** (`/login`) — builds the authorization URL with `response_type=code`, a generated PKCE challenge, and state, then redirects the browser to NamoID.
- **`oauth.namoid.authorize_access_token()`** (`/callback`) — exchanges the code (client authenticates with `client_secret_basic`), validates the returned `id_token`, and hands back `token["userinfo"]`. We store those claims in the Flask session and redirect to `/profile`.

## Production deployment

Same code, three swaps:

- Use the **production** `client_id` / `client_secret` from NamoID (not your dev client).
- Serve the app over HTTPS and set `NAMOID_REDIRECT_URI` to your `https://your-app.com/callback`.
- Register that production redirect URI on the OAuth client (add it to the dev client or create a separate prod client).

## Troubleshooting

- **`redirect_uri mismatch`** — `NAMOID_REDIRECT_URI` must be character-for-character identical to a Redirect URI registered on the OAuth client (`http://localhost:3003/callback` for local dev).
- **`invalid_client`** — wrong `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`, or the secret was rotated. Copy them again from the application page.
- **`iss` / issuer mismatch** — `NAMOID_ISSUER` must exactly match the `iss` claim in the id_token. Use the project's hosted issuer with **no trailing slash** (`https://<slug>.id.namoid.in`).
- **`mismatching_state` or PKCE errors** — the session cookie was lost between `/login` and `/callback`. Make sure `FLASK_SECRET_KEY` is set and stable across restarts, and that you reach the app on the same host/port you registered.
