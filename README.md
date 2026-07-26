# NamoID examples

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Official, runnable integrations for [NamoID](https://namoid.in). Examples are
organized by integration model first, then framework, so standards-based
OAuth, OpenID Connect, Workforce SSO, and Agent Access can be added without
mixing their configuration or security models.

## Available now: Hosted Auth

Hosted Auth redirects users to a branded NamoID sign-in page and returns a
one-time code to the application. The Client ID resolves the application,
environment, and Hosted Auth domain—there is no application ID or issuer to
copy into SDK configuration.

| Example | Use it when |
|---|---|
| [`hosted-auth/react-spa`](./hosted-auth/react-spa) | You have a browser-only React application and need Authorization Code + PKCE without a secret. |
| [`hosted-auth/express-react`](./hosted-auth/express-react) | React and a separate Express API need a confidential, server-managed application session. |
| [`hosted-auth/nextjs`](./hosted-auth/nextjs) | You want the smallest complete Next.js App Router integration. |
| [`hosted-auth/nextjs-supabase`](./hosted-auth/nextjs-supabase) | NamoID owns authentication and Supabase stores application data. |

The Express and Next.js examples demonstrate the complete confidential Hosted
Auth flow:

1. Start a state-bound sign-in transaction.
2. Redirect the browser to the application’s NamoID-hosted sign-in page.
3. Exchange the returned one-time code on the server.
4. Validate the NamoID access token.
5. Create an HttpOnly application session.
6. Revoke the NamoID session during sign-out.

The React SPA demonstrates the public-client variant: state and PKCE protect
the browser redirect, the Client ID is safe to expose, and no Client Secret is
placed in frontend code.

## Run with Docker

Each example has a production multi-stage Docker image. Copy the root
`.env.example` to `.env`, fill in the values for the service you want, then run:

```bash
# Express + React
docker compose up --build express-react

# React SPA
docker compose up --build react-spa

# Standalone Next.js
docker compose up --build nextjs

# Next.js with Supabase
docker compose up --build nextjs-supabase

# Or run every example
docker compose up --build
```

The Compose services load secrets only at runtime. Local environment files,
dependencies, and build outputs are excluded from Docker build contexts.
Change the matching `*_HOST_PORT` in `.env` when a default host port is already
occupied, then update that example's application URL and registered NamoID
callback.

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
