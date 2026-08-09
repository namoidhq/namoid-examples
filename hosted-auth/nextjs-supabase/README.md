# NamoID Hosted Auth + Next.js + Supabase

This example uses NamoID Hosted Auth for user authentication and Supabase for
application data. It intentionally does not create a second Supabase Auth
identity for the same person.

## Trust boundary

- NamoID authenticates the user and issues the application session.
- The callback validates the signed NamoID ID token and UserInfo subject.
- Next.js loads UserInfo before every protected data access.
- Supabase is called only from trusted server code.
- The Supabase secret key never reaches the browser.
- The server derives `namoid_user_id` from the validated session; it never
  accepts that identifier from a form or URL.

Supabase does not currently list NamoID as a native third-party authentication
provider. This example therefore does not claim direct browser-to-Supabase RLS
authorization. NamoID authentication terminates in trusted Next.js server code,
which uses the validated subject to scope every Supabase query.

## Configure NamoID

1. Open an application in a NamoID Test environment.
2. Register this exact callback URL:

   ```text
   http://localhost:3002/api/auth/callback
   ```

3. Copy the Test Client ID and Client Secret shown for the application.

## Configure Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
3. Copy the project URL and server-only secret key from Project Settings.

Copy `.env.example` to `.env.local` and set:

```env
NAMOID_CLIENT_ID=namoid_client_test_…
NAMOID_CLIENT_SECRET=namoid_secret_test_…
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

## Run with Docker

After applying the Supabase schema, copy the repository root `.env.example` to
`.env`, set the `SUPABASE_*` values, and run:

```bash
docker compose up --build nextjs-supabase
```

Open <http://localhost:3002>. Stop the container with:

```bash
docker compose down
```
