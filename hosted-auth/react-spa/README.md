# NamoID Hosted Auth + React SPA

A browser-only React example using `@namoidhq/react`. It uses the OAuth
Authorization Code flow with PKCE, so the SPA needs a Client ID but must never
receive a Client Secret.

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

The example stores the PKCE transaction and returned tokens in
`sessionStorage`, which limits them to the current browser tab. For a
production SPA, prefer in-memory token storage where your UX permits it, apply
a strict Content Security Policy, and avoid untrusted third-party scripts.

## Run with Docker

From the repository root, set `SPA_NAMOID_CLIENT_ID` in `.env`, then run:

```bash
docker compose up --build react-spa
```

The Client ID is compiled into the browser bundle by Vite. This is expected:
Client IDs identify applications and are not secrets.
