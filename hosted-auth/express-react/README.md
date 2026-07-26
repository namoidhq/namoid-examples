# NamoID Hosted Auth + Express + React

A split frontend/backend example for teams that use React as a client and
Express as their trusted application server.

## Trust boundary

- React never receives the NamoID Client Secret, access token, or refresh token.
- Express creates and stores the state/PKCE transaction.
- Express exchanges the callback code with the Client ID and Client Secret.
- The browser receives only an opaque, `HttpOnly`, `SameSite=Lax` application
  session cookie.
- Protected routes validate the NamoID access token and rotate it from the
  server-held refresh token before expiry.
- Sign-out revokes the NamoID session, destroys the application session, and
  clears the Hosted Auth browser session.

## Configure NamoID

Create or open a **confidential web application** in a Test environment.

For local development, register:

```text
http://localhost:5174/api/auth/callback
```

For Docker, register:

```text
http://localhost:3003/api/auth/callback
```

Copy the environment's Client ID and Client Secret.

## Run locally

```bash
cp .env.example .env
# Fill in NAMOID_CLIENT_ID, NAMOID_CLIENT_SECRET, and SESSION_SECRET.
pnpm install
pnpm dev
```

Open <http://localhost:5174>. Vite proxies `/api` to Express on port `4000`.

## Run with Docker

Set the `EXPRESS_REACT_*` values in the repository root `.env`, then run:

```bash
docker compose up --build express-react
```

Open <http://localhost:3003>.

## Production session storage

This runnable example uses `express-session`'s in-memory store, which is
appropriate only for a single-process demonstration. Before deploying a real
application, configure a durable shared store such as Redis or a database,
rotate `SESSION_SECRET` safely, use HTTPS, and set the production
`APP_BASE_URL`.

The authentication and refresh tokens already remain server-side; changing
the Express session store does not change the React integration.
