# NamoID Hosted Auth + Next.js + Supabase

This example uses NamoID Hosted Auth for user authentication and Supabase for
application data. It intentionally does not create a second Supabase Auth
identity for the same person.

## Trust boundary

- NamoID authenticates the user and issues the application session.
- Next.js validates the NamoID access token before every protected data access.
- Supabase is called only from trusted server code.
- The Supabase secret key never reaches the browser.
- The server derives `namoid_user_id` from the validated session; it never
  accepts that identifier from a form or URL.

Supabase does not currently list NamoID as a native third-party authentication
provider, and NamoID's public OIDC client contract is not enabled yet. This
example therefore does not claim direct browser-to-Supabase RLS authorization.
When that standards integration is available, this example can move to
third-party JWT verification and user-scoped RLS policies.

## Configure NamoID

1. Open an application in a NamoID Test environment.
2. Register this exact callback URL:

   ```text
   http://localhost:3002/api/auth/callback
   ```

3. Create an Auth secret key and copy it when shown.

## Configure Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Copy the project URL and server-only secret key from Project Settings.

Copy `.env.example` to `.env.local` and set:

```env
NAMOID_AUTH_SECRET_KEY=namoid_auth_sk_test_…
NEXT_PUBLIC_APP_URL=http://localhost:3002
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
```

## Run locally

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3002>, sign in through NamoID, and save a display name.
The dashboard reads and writes only the row belonging to the validated NamoID
user.
