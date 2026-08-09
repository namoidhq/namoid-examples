# NamoID Hosted Auth + React SPA

A browser-only React example using `@namoidhq/react`. It demonstrates NamoID's
popup-first sign-in modal on top of the OAuth Authorization Code flow with
PKCE. The SPA needs a Client ID but must never receive a Client Secret.

Planned public demo: `spa.examples.namoid.in`. It must use a dedicated NamoID
Test application; visitors should never enter production or sensitive data.

## Configure NamoID

Create or open a **public / SPA** application in a Test environment, then
register:

- Redirect URI: `http://localhost:5173/auth/callback`
- Allowed web origin: `http://localhost:5173`

Copy the Test Client ID. Do not create or place a Client Secret in this app.

## Run locally

```bash
cp .env.example .env.local
# Set VITE_NAMOID_CLIENT_ID in .env.local
pnpm install
pnpm dev
```

Open <http://localhost:5173>.

Choose **Sign in** to open the application-owned modal. The SDK launches the
NamoID-hosted authentication ceremony in a focused popup and relays only the
authorization result through the same-origin callback. Credentials, passkeys,
MFA codes, and provider tokens are never rendered into the application DOM.

If the browser blocks the popup, the SDK starts a fresh full-page redirect and
the same callback route completes it. The SDK stores only short-lived state,
nonce, and PKCE transaction data in `sessionStorage`. This example keeps
returned tokens in memory and removes the authorization response from browser
history. Reloading or closing the tab removes the local app session.

A production SPA should apply a strict Content Security Policy, avoid untrusted
third-party scripts, and prefer a confidential backend-for-frontend when it
needs durable sessions or refresh tokens.

## Run with Docker

From the repository root, set `SPA_NAMOID_CLIENT_ID` in `.env`, then run:

```bash
docker compose up --build react-spa
```

The Client ID is compiled into the browser bundle by Vite. This is expected:
Client IDs identify applications and are not secrets.
