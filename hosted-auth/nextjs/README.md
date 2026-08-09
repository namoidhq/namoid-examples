# NamoID + Next.js quickstart

Next.js App Router example using `@namoidhq/nextjs` and NamoID Hosted Auth.
The application is selected by its NamoID Client ID—there is no application ID or
Hosted Auth URL to copy into your code.

Planned public demo: `nextjs.examples.namoid.in`. It must use a dedicated
NamoID Test application; visitors should never enter production or sensitive
data.

## What it includes

- `/` — public landing page
- `/api/auth/login` — creates a state-bound transaction and redirects to Hosted Auth
- `/api/auth/callback` — exchanges the code, validates the signed ID token, and creates HttpOnly cookies
- `/api/auth/logout` — revokes the token grant, clears cookies, and ends the hosted session
- `/dashboard` — loads UserInfo before rendering authenticated data

## Run locally

In the NamoID Console:

1. Open the application in its Test environment.
2. Add this exact callback URL:

```text
http://localhost:3001/api/auth/callback
```

3. Copy the Test Client ID and Client Secret shown for the application.

Copy `.env.example` to `.env.local`:

```env
NAMOID_CLIENT_ID=namoid_client_test_…
NAMOID_CLIENT_SECRET=namoid_secret_test_…
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Install and run:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3001> and choose **Sign in**. The NamoID-secured hosted
page authenticates the user, returns a one-time code, and the server route
exchanges it using the server-only application credentials.

## Run with Docker

Copy the repository root `.env.example` to `.env`, set the `NEXTJS_*` values,
then run:

```bash
docker compose up --build nextjs
```

Open <http://localhost:3001>. Stop the container with:

```bash
docker compose down
```

The Client Secret stays on the server. The Client ID selects the application
and lets the SDK resolve the correct Hosted Auth domain automatically. Do not
expose the Client Secret through a `NEXT_PUBLIC_*` variable.

The callback validates issuer, state, PKCE, nonce, the signed ID token, and the
UserInfo subject through the SDK. This compact example stores tokens in
HttpOnly cookies. For production, prefer an encrypted cookie or durable
server-side session and refresh access tokens before expiry.
