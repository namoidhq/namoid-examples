# Hosting the public examples

The first hosted release uses free Git-connected services and dedicated NamoID
Test applications. No production customer credentials belong in these demos.

## Public URLs

| Site | Host | Repository root directory |
|---|---|---|
| `examples.namoid.in` | Vercel | `examples-hub` |
| `nextjs.examples.namoid.in` | Vercel | `hosted-auth/nextjs` |
| `spa.examples.namoid.in` | Cloudflare Pages | `hosted-auth/react-spa` |

The Supabase and Express examples remain source-only until their public demo
data and runtime boundaries are ready.

## NamoID Test applications

Create one application per demo. This keeps redirect URIs, sessions, audit
events, and credential rotation isolated.

### Next.js

- Application type: confidential web application
- Callback URL: `https://nextjs.examples.namoid.in/api/auth/callback`
- Environment variables in Vercel:
  - `NAMOID_CLIENT_ID`
  - `NAMOID_CLIENT_SECRET`
  - `NEXT_PUBLIC_APP_URL=https://nextjs.examples.namoid.in`

### React SPA

- Application type: public / SPA
- Callback URL: `https://spa.examples.namoid.in/auth/callback`
- Allowed web origin: `https://spa.examples.namoid.in`
- Build environment variable in Cloudflare Pages:
  - `VITE_NAMOID_CLIENT_ID`

## Vercel projects

Import this GitHub repository once for each Vercel site and set the Root
Directory shown above. Vercel detects Vite and Next.js from each selected
directory. Add the custom domain only after the first successful deployment.

## Cloudflare Pages project

Connect this GitHub repository and use:

- Root directory: `hosted-auth/react-spa`
- Build command: `pnpm build`
- Build output directory: `dist`
- Environment variable: `VITE_NAMOID_CLIENT_ID`

After the first successful deployment, attach `spa.examples.namoid.in` and add
that final origin and callback URL to the corresponding NamoID Test app.

## Safety baseline

- Display that each site is a public Test application.
- Ask visitors not to enter production or sensitive data.
- Never put a Client Secret in a browser-visible environment variable.
- Use exact callback URLs and web origins; do not configure wildcards.
- Keep each demo in a separate NamoID application.
- Rotate a demo credential immediately if it appears in source, logs, or build output.
