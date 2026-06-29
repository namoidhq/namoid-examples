# NamoID + Next.js quickstart

The shortest path from "I have a Next.js app" to "users sign in with NamoID."

Stack: Next.js 15 (App Router) + Auth.js v5 (NextAuth) configured as an OIDC
client against NamoID. No hardcoded endpoints — Auth.js auto-discovers from
the issuer URL.

## What you get

- `/` — public landing page with a "Sign in with NamoID" button
- `/dashboard` — protected route, shows the session JSON returned by NamoID
- Middleware redirects unauthenticated users to NamoID's login

## Run it locally (3 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Settings → Auth clients →
New client. Use these values:

| Field | Value |
|---|---|
| Display name | Local quickstart |
| Redirect URI | `http://localhost:3001/api/auth/callback/namoid` |
| Scopes | `openid`, `email`, `profile` |

Save → you'll see the `client_id` and a one-time `client_secret`. Copy both.
While you're on the project page, also copy the **Discovery URL** shown in
"Integration setup" — it's your project's hosted issuer
(`https://<your-project-slug>.id.namoid.in`).

### 2. Configure this app

```bash
cd examples/nextjs-quickstart
cp .env.example .env.local
```

Edit `.env.local`:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=<your client_id from step 1>
NAMOID_CLIENT_SECRET=<your client_secret from step 1>
AUTH_SECRET=<run: openssl rand -base64 32>
AUTH_URL=http://localhost:3001
```

### 3. Install + run

```bash
pnpm install     # or npm install / yarn install
pnpm dev
```

Open http://localhost:3001 → click **Sign in with NamoID** → authenticate on
namoid.in → land at `/dashboard` with the session payload.

## How it works (in 4 files)

- **`auth.ts`** — one Auth.js config object. NamoID is registered as a
  generic OIDC provider. The Discovery URL
  (`${NAMOID_ISSUER}/.well-known/openid-configuration`) is fetched
  automatically; we never hardcode the authorize / token / userinfo URLs.
- **`middleware.ts`** — re-exports Auth.js's `auth` as Next.js middleware.
  Anything not on the landing page requires a session.
- **`app/api/auth/[...nextauth]/route.ts`** — Auth.js's request handlers.
- **`app/page.tsx`** / **`app/dashboard/page.tsx`** — UI.

That's the entire integration. Real apps add a database to persist the user,
fetch additional NamoID API data via an access token, etc.

## Production deployment

Same setup, three swaps:

```env
NAMOID_CLIENT_ID=<prod client_id>        # different from the dev one
NAMOID_CLIENT_SECRET=<prod client_secret>
AUTH_URL=https://your-app.com
```

Register `https://your-app.com/api/auth/callback/namoid` as an additional
redirect URI on the same client (or create a separate prod client).

## Troubleshooting

- **"Cannot find module 'next-auth'"** — Run `pnpm install`. We pin
  `next-auth@^5.0.0-beta.25` (Auth.js v5).
- **"InvalidIssuer" error after sign-in** — `NAMOID_ISSUER` in `.env.local`
  doesn't exactly match the `iss` claim in the token. Use the project's
  hosted issuer (`https://<slug>.id.namoid.in`, no trailing slash).
- **"Redirect URI mismatch"** — the URI you registered on the OAuth client
  must be character-for-character identical to
  `${AUTH_URL}/api/auth/callback/namoid`.
- **Sign-in redirects loop** — `AUTH_SECRET` is missing or changed across
  restarts. Re-run `openssl rand -base64 32` once and pin it.
