# NamoID examples

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Official, runnable integrations for [NamoID](https://namoid.in). Examples are
organized by integration model first, then framework, so standards-based
OAuth, OpenID Connect, Workforce SSO, and Agent Access can be added without
mixing their configuration or security models.

## Available now: Hosted Auth

Hosted Auth redirects users to a branded NamoID sign-in page and returns a
one-time code to the application. Application keys resolve the application,
environment, and Hosted Auth domain—there is no application ID or issuer to
copy into SDK configuration.

| Example | Use it when |
|---|---|
| [`hosted-auth/nextjs`](./hosted-auth/nextjs) | You want the smallest complete Next.js App Router integration. |
| [`hosted-auth/nextjs-supabase`](./hosted-auth/nextjs-supabase) | NamoID owns authentication and Supabase stores application data. |

Both examples demonstrate the complete confidential Hosted Auth flow:

1. Start a state-bound sign-in transaction.
2. Redirect the browser to the application’s NamoID-hosted sign-in page.
3. Exchange the returned one-time code on the server.
4. Validate the NamoID access token.
5. Create an HttpOnly application session.
6. Revoke the NamoID session during sign-out.

## Run with Docker

Each example has a production multi-stage Docker image. Copy the root
`.env.example` to `.env`, fill in the values for the service you want, then run:

```bash
# Standalone Next.js
docker compose up --build nextjs

# Next.js with Supabase
docker compose up --build nextjs-supabase

# Or run both
docker compose up --build
```

The Compose services load secrets only at runtime. Local environment files,
dependencies, and build outputs are excluded from Docker build contexts.
Change `NEXTJS_HOST_PORT` or `SUPABASE_NEXTJS_HOST_PORT` in `.env` when a
default host port is already occupied, and update the matching application URL
and registered NamoID callback.

## Integration families

| Family | Purpose | Repository status |
|---|---|---|
| Hosted Auth | NamoID-hosted consumer sign-in and application sessions | Available |
| OAuth / OpenID Connect | Standards-compatible clients, scopes, discovery, and tokens | Add when the public contract is enabled |
| Workforce SSO | Employee application access through OIDC or SAML | Add when public examples are ready |
| Agent Access | Governed OAuth and MCP access for agents and tools | Add when public examples are ready |

Directories for planned families will be added only when their public contract
is supported and tested. This prevents examples from advertising configuration
that is not available in the Console.

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-examples/issues](https://github.com/namoidhq/namoid-examples/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
