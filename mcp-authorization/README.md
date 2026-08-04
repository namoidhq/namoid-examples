# MCP Authorization

Protect an HTTP MCP server with NamoID. A signed-in human authorizes an MCP
client — Claude, ChatGPT, Cursor, VS Code — to call **your** MCP server, and
NamoID issues a short-lived token limited to that server and to the actions the
user approved.

Four roles, and it is worth being precise about them:

| Role | Who |
|---|---|
| Authorization server | NamoID |
| Protected resource | Your MCP server (these examples) |
| OAuth client | The MCP host or client |
| Resource owner | The signed-in human |

This follows the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
OAuth 2.1 profile: protected-resource discovery (RFC 9728), authorization-server
discovery (RFC 8414), PKCE, resource indicators (RFC 8707), audience validation,
and bearer tokens in the `Authorization` header.

## Pick an example

| Example | Use it when |
|---|---|
| [`express-ts`](./express-ts) | You run Node. Express + `@modelcontextprotocol/sdk`, with the token verifier written out in full. |
| [`fastmcp-python`](./fastmcp-python) | You run Python. FastMCP, which already implements the resource-server half. |

Both expose the same four tools, the same four scopes, and the same behaviour on
every success and failure path. Pick by language, not by capability.

## Quickstart

You need a NamoID Test environment and a publicly reachable HTTPS URL for the
MCP server. Local development over `http://localhost` works for everything
except a real MCP host, which requires HTTPS.

**1. Register the MCP resource.** In the Console, open your Project, select the
**Test** environment, then **MCP Authorization** → *Register MCP resource*:

- **Name** — `Acme Finance MCP`
- **MCP server URL / audience** — the canonical public URL, e.g.
  `https://mcp.acme.example/mcp`

The audience is immutable after creation and is compared as an exact string.
Decide on the trailing slash and the path now.

**2. Add the scopes.** Still under the resource, add four permission scopes.
`Risk` drives how prominently consent warns the user:

| Value | Display name | Risk | Default |
|---|---|---|---|
| `customers:read` | View customers | read | yes |
| `invoices:read` | View invoices | read | yes |
| `invoices:create` | Create invoices | write | no |
| `refunds:create` | Issue refunds | sensitive write | no |

Only the two read scopes are advertised for a first connection. A user should
never be asked to pre-approve moving money just to connect.

**3. Copy the issuer.** From **Integration details**, copy *Authorization
server* — that is your `NAMOID_ISSUER`, e.g.
`https://acme-test.id.namoid.in`. Test and Live are different issuers, and
nothing is copied between them.

**4. Run the server.**

```bash
cd express-ts        # or: cd fastmcp-python
cp .env.example .env # then set NAMOID_ISSUER and NAMOID_MCP_RESOURCE
pnpm install && pnpm dev
```

**5. Check it.** In a second terminal:

```bash
pnpm verify          # express-ts
python scripts/verify.py   # fastmcp-python
```

Each line is one protocol requirement, so a failure names the exact step that is
wrong:

```
  ok    server is running
  ok    NamoID discovery is reachable
  ok    protected-resource metadata is published
  ok    unauthenticated call returns a discovery challenge
  ok    a forged token is rejected
```

## How the flow runs

1. The client calls a tool with no token.
2. Your server answers `401` with
   `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="..."`.
3. The client fetches that metadata document and learns which authorization
   server to use.
4. The client fetches NamoID's authorization-server metadata.
5. The client sends an authorization request carrying `resource`, `scope`, and
   PKCE `S256`.
6. NamoID authenticates the user and shows consent naming the client, the
   resource, and each requested action.
7. The client exchanges the code — repeating the same `resource` — for a
   short-lived JWT whose `aud` is your canonical MCP URL.
8. Your server validates the token and the scope for the specific tool, then
   applies its own business rules.

For a resource URL with a path, RFC 9728 puts the well-known segment between the
authority and the path, so `https://mcp.acme.example/mcp` publishes metadata at
`https://mcp.acme.example/.well-known/oauth-protected-resource/mcp`. Both
examples derive this path from the resource URL rather than hard-coding it.

## Connect an MCP client

NamoID resolves clients two ways for a customer-owned MCP resource:

- **Preregistered** — create an application in the Console and give the client
  its Client ID. Use this when you control the client.
- **Client ID Metadata Document (CIMD)** — the client's `client_id` is an HTTPS
  URL serving a JSON document describing itself. NamoID fetches and validates it
  behind an SSRF guard, then registers an environment-local projection.
  Discovery advertises `client_id_metadata_document_supported: true`.

**Dynamic Client Registration will not work here.** NamoID's
`/v1/oauth/register` endpoint exists, but it only accepts NamoID's own
first-party MCP scopes — it rejects a registration that asks for your resource's
scopes. A host that can *only* do DCR cannot connect to a customer MCP resource
yet. Use a preregistered Client ID or CIMD.

Because of that, MCP Inspector needs a preregistered Client ID entered in its
OAuth settings rather than its default registration flow.

## Who owns what

NamoID owns the authorization server: resource registration, the scope
catalogue and consent copy, discovery, hosted authentication, authorization code
+ PKCE, client resolution, consent and incremental consent, audience-bound token
issuance, refresh rotation and revocation, and protocol audit events.

You own the MCP server: the canonical resource URL, the RFC 9728 metadata
document, correct `401` and `403` challenges, the mapping from every tool to its
scopes, and — this is the part that gets skipped — the business authorization
after the scope check.

A scope is permission to **attempt** an action. `refunds:create` does not mean a
user may refund another organization's invoice or exceed your refund policy.
Both examples make this concrete: `issue_refund` checks the scope, then checks
ownership, invoice status, refund amount, and an account limit.

## Designing scopes

Scope names are yours. `customers:read` and `refunds:create` are just what this
example uses; `orders:read` or `tickets:assign` are equally valid.

- 1–128 characters, from letters, digits, `_`, `:`, `.`, and `-`.
- Compared case-sensitively; lowercase is recommended.
- The reserved OIDC scopes `openid`, `profile`, `email`, `phone`, and
  `offline_access` cannot be resource scopes.
- Unknown or disabled scopes fail with `invalid_scope`.
- One scope per distinct user-visible capability. Splitting read from write is
  what makes incremental consent meaningful.

## Security checklist

- HTTPS everywhere outside local development.
- Verify signature, `iss`, `aud`, `exp`/`nbf`, and `token_use=access` — a
  signature check alone is not enough, and an ID token must never be accepted as
  an API token.
- Accept only `RS256` from NamoID's JWKS. Never accept `none` or a symmetric
  algorithm.
- A token minted for another MCP server must be rejected. Exact audience match.
- Never log or echo a bearer token, refresh token, authorization code, PKCE
  verifier, or tool payload.
- Never forward the received token to a downstream API. Get a token for that API
  instead.
- Enforce scope **and** domain policy in every tool handler.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Every token rejected, `aud` mismatch | `NAMOID_MCP_RESOURCE` differs from the registered audience. Check scheme, host, path, trailing slash. |
| Startup fails with an issuer mismatch | `NAMOID_ISSUER` does not match the `issuer` in its own discovery document. Copy it from Integration details. |
| Startup cannot reach the issuer | Wrong issuer host, or the environment is in a different Test/Live environment than you think. |
| `invalid_target` at the token endpoint | The `resource` sent at authorization and at token exchange differ. They must be identical. |
| `invalid_scope` | The scope is not registered on the resource, or it is disabled. |
| Client cannot register | Expected — DCR is not available for customer MCP resources. Use a preregistered Client ID or CIMD. |
| Tool call returns `insufficient_scope` | Working as intended. The client should start incremental authorization for the named scope. |
| Metadata 404s | The path must be derived from the resource path, not fixed at `/.well-known/oauth-protected-resource`. |

## Status

The management and OAuth foundation for MCP resource authorization is
implemented: environment-scoped resources, the scope catalogue, consent, grants
and revocation, audience-bound issuance, and CIMD. Broad interoperability
testing across MCP hosts is still in progress, so treat host support as
something to verify for your own client rather than as a settled matrix.

## Reference

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [RFC 9728 — Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html)
- [RFC 8707 — Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 8414 — Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [Client ID Metadata Document draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document)
