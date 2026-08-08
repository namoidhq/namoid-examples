# MCP Authorization — Express + TypeScript

An HTTP MCP server protected by NamoID, built on Express and
`@modelcontextprotocol/sdk`. NamoID is the authorization server, this server is
the protected resource, and the token verifier is written out in full rather
than hidden behind a helper.

Read [`../README.md`](../README.md) first for the Console setup and the flow.

## Run it

```bash
cp .env.example .env   # set NAMOID_ISSUER and NAMOID_MCP_RESOURCE
pnpm install
pnpm dev
```

Then, in a second terminal:

```bash
pnpm verify
```

`pnpm verify` checks the four things an MCP client checks — discovery, published
metadata, the unauthenticated challenge, and rejection of a forged token — so a
misconfiguration is named instead of appearing later as an opaque `401`.

## Files

| File | What it does |
|---|---|
| [`src/namoid-mcp-auth.ts`](./src/namoid-mcp-auth.ts) | The reusable part. Discovery, JWKS, token verification, and the per-tool scope guard. Copy this into a real server. |
| [`src/index.ts`](./src/index.ts) | Express wiring and the four tools. |
| [`src/demo-data.ts`](./src/demo-data.ts) | In-memory stand-in for your system of record. |
| [`scripts/verify.mjs`](./scripts/verify.mjs) | The pre-client protocol check. |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `NAMOID_ISSUER` | yes | Environment issuer, e.g. `https://acme-test.id.namoid.in`. |
| `NAMOID_MCP_RESOURCE` | yes | Canonical MCP URL, exactly as registered as the audience. |
| `NAMOID_MCP_RESOURCE_NAME` | no | Name shown during discovery and consent. |
| `PORT` | no | Listen port, default `3004`. |
| `MCP_BASE_URL` | no | Used only by `pnpm verify`, default `http://localhost:3004`. |

Both URLs are validated at startup. A non-HTTPS issuer or resource is rejected
unless the host is a loopback or `.localhost` name, so a misconfigured
production deployment fails immediately.

## Tools and scopes

| Tool | Scope | Notes |
|---|---|---|
| `find_customer` | `customers:read` | Read |
| `list_invoices` | `invoices:read` | Read |
| `create_invoice` | `invoices:create` | Write; also checks the customer belongs to the caller |
| `issue_refund` | `refunds:create` | Sensitive write; also checks ownership, status, amount, and an account limit |

Only `customers:read` and `invoices:read` are advertised in
`scopes_supported`. The write scopes are meant to be requested incrementally.

## How it fits together

`createNamoIDMcpAuth` runs once at startup. It fetches
`{issuer}/.well-known/oauth-authorization-server`, checks the document declares
the issuer that was asked for — RFC 9700 mix-up defence — and reads `jwks_uri`
from it rather than hard-coding a key location. It returns the RFC 9728 metadata
document, the path to publish it on, and a verifier.

The verifier accepts only `RS256` from NamoID's JWKS and checks `iss`, `aud`,
`exp`/`nbf` with 30 seconds of clock tolerance, `token_use=access`, and the
presence of `sub` and `client_id`. Failures collapse to a short reason so no
token contents or stack traces reach the client.

The MCP endpoint sits behind the SDK's `requireBearerAuth`, which produces the
`401` and the `WWW-Authenticate` challenge that starts discovery. It is
deliberately configured **without** `requiredScopes`: connecting needs a valid
token, not every scope, so a read-only client can still connect and list tools.

Each tool is wrapped in `requireScopes`, which checks the granted scopes and
otherwise answers with an `insufficient_scope` payload naming the missing
scopes, the resource, and the metadata URL — the information a host needs to ask
the user for more access.

The transport runs stateless: a fresh `McpServer` and transport per request, so
no session state is shared between two users' tokens.

## Connect an MCP client

MCP hosts require HTTPS, so put a tunnel or proxy in front of the local port and
make sure `NAMOID_MCP_RESOURCE` is that public URL. Use a preregistered Client
ID or a Client ID Metadata Document — Dynamic Client Registration does not work
against a customer MCP resource. See [`../README.md`](../README.md#connect-an-mcp-client).

## Docker

```bash
docker compose up --build mcp-express-ts   # from the repository root
```

## What this example is not

State lives in memory and is lost on restart. There is no database, no real
payment system, and no persistence of refunds. The authorization path is the
part worth copying; the domain logic is a placeholder for yours.
