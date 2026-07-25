# NamoID + Next.js quickstart

Next.js App Router example using `@namoidhq/nextjs` and NamoID Hosted Auth.
The application is selected by its NamoID key—there is no application ID or
Hosted Auth URL to copy into your code.

## What it includes

- `/` — public landing page
- `/api/auth/login` — creates a state-bound transaction and redirects to Hosted Auth
- `/api/auth/callback` — exchanges the one-time code and creates an HttpOnly cookie
- `/api/auth/logout` — revokes the native session and clears cookies
- `/dashboard` — validates the access token before rendering authenticated data

## Run locally

In the NamoID Console:

1. Open the application in its Test environment.
2. Add this exact callback URL:

```text
http://localhost:3001/api/auth/callback
```

3. Create an Auth secret key for that application and copy it when shown.

Copy `.env.example` to `.env.local`:

```env
NAMOID_AUTH_SECRET_KEY=<your environment auth secret key>
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Install and run:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3001> and choose **Sign in with NamoID**. The hosted
page authenticates the user, returns a one-time code, and the server route
exchanges it using the Auth secret key.

The secret key stays on the server. It selects the application and lets the SDK
resolve the correct Hosted Auth domain automatically. Do not expose it through
a `NEXT_PUBLIC_*` variable.

This example deliberately validates the access token instead of trusting a
separate user ID cookie. In a production application, store the tokens in an
encrypted or server-side session and apply the same validation boundary before
accessing protected data.
