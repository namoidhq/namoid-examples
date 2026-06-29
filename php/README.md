# PHP + NamoID quickstart

The shortest path from "I have a PHP script" to "users sign in with NamoID" —
vanilla PHP 8.2 + [`jumbojett/openid-connect-php`](https://github.com/jumbojett/OpenID-Connect-PHP),
which handles OIDC discovery, PKCE, the token exchange, and id_token validation
for you. No hardcoded endpoints — everything is discovered from the issuer URL.

## What you get

- `/` — home: a "Sign in with NamoID" button, or your name + email + Sign out once authenticated
- `/login` — kicks off Authorization Code + PKCE (S256) and redirects to NamoID
- `/callback` — the registered redirect URI; the library completes the flow here
- `/profile` — protected route, dumps the verified OIDC claims
- `/logout` — destroys the session and returns home

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications → New
application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3007/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/php
cp .env.example .env
```

Fill in the four `NAMOID_` vars in `.env`:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=<your client_id from step 1>
NAMOID_CLIENT_SECRET=<your client_secret from step 1>
NAMOID_REDIRECT_URI=http://localhost:3007/callback
```

### 3. Install + run

```bash
composer install
php -S localhost:3007 index.php
```

Open http://localhost:3007 → click **Sign in with NamoID** → authenticate on
namoid.in → land at `/profile` with your claims.

## How it works

Everything lives in **`index.php`**, a single front controller that switches on
the request path. The integration is three lines on the OIDC client:

```php
$oidc = new OpenIDConnectClient($NAMOID_ISSUER, $clientId, $clientSecret);
$oidc->setRedirectURL($NAMOID_REDIRECT_URI);
$oidc->setCodeChallengeMethod('S256');   // PKCE is mandatory
$oidc->addScope(['openid', 'profile', 'email']);
```

`$oidc->authenticate()` does double duty: on `/login` it builds the PKCE
challenge and redirects to NamoID; when the browser comes back to `/callback`
with `?code=...`, the same `authenticate()` call detects the code, exchanges it
for tokens, and validates the id_token. After it returns `true` we read claims
via `getVerifiedClaims()` / `getIdTokenPayload()` / `requestUserInfo('email')`
and stash them in `$_SESSION`. The authorize / token / userinfo / jwks URLs are
all discovered from `${NAMOID_ISSUER}/.well-known/openid-configuration` — never
hardcoded.

## Production deployment

Same code, three swaps:

- Use live `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET` (a separate prod client).
- Set `NAMOID_REDIRECT_URI` to your real HTTPS URL, e.g.
  `https://your-app.com/callback`, and register it as an additional redirect URI
  on the OAuth client.
- Serve over HTTPS behind a real web server (nginx/Apache + PHP-FPM); the
  built-in `php -S` server is for local dev only.

## Troubleshooting

- **`redirect_uri mismatch`** — `NAMOID_REDIRECT_URI` must be
  character-for-character identical to the URI registered on the OAuth client
  (`http://localhost:3007/callback`).
- **`invalid_client`** — wrong `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`, or
  the secret was rotated. Copy them fresh from the application page.
- **`iss` mismatch after sign-in** — `NAMOID_ISSUER` must exactly match the
  `iss` claim. Use the hosted issuer (`https://<slug>.id.namoid.in`) with **no
  trailing slash**.
- **PKCE / `code_challenge` errors** — make sure
  `$oidc->setCodeChallengeMethod('S256')` is set; NamoID rejects flows without
  PKCE.
- **Sign-in never completes / "stuck on callback"** — the library needs the
  redirect URL to hit this same `index.php`. Start the server with
  `php -S localhost:3007 index.php` (note the trailing `index.php` front
  controller) so `/callback` routes back through `authenticate()`.
