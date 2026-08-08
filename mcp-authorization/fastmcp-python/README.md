# MCP Authorization — FastMCP + Python

An HTTP MCP server protected by NamoID, built on
[FastMCP](https://gofastmcp.com). NamoID is the authorization server and this
server is the protected resource. FastMCP already implements most of the
resource-server half, so this example is mostly about the two places where
NamoID's token contract needs saying out loud.

Read [`../README.md`](../README.md) first for the Console setup and the flow.

## Run it

```bash
cp .env.example .env   # set NAMOID_ISSUER and NAMOID_MCP_RESOURCE
python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python server.py
```

Then, in a second terminal:

```bash
.venv/bin/python scripts/verify.py
```

`verify.py` checks the four things an MCP client checks — discovery, published
metadata, the unauthenticated challenge, and rejection of a forged token — so a
misconfiguration is named instead of appearing later as an opaque `401`.

## Files

| File | What it does |
|---|---|
| [`namoid_mcp_auth.py`](./namoid_mcp_auth.py) | The reusable part. Discovery, the hardened verifier, and the per-tool scope guard. Copy this into a real server. |
| [`server.py`](./server.py) | FastMCP wiring and the four tools. |
| [`demo_store.py`](./demo_store.py) | In-memory stand-in for your system of record. |
| [`scripts/verify.py`](./scripts/verify.py) | The pre-client protocol check. |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `NAMOID_ISSUER` | yes | Environment issuer, e.g. `https://acme-test.id.namoid.in`. |
| `NAMOID_MCP_RESOURCE` | yes | Canonical MCP URL, exactly as registered as the audience. Its path also decides where the MCP endpoint is served. |
| `NAMOID_MCP_RESOURCE_NAME` | no | Name shown during discovery and consent. |
| `PORT` | no | Listen port, default `3005`. |
| `MCP_BASE_URL` | no | Used only by `verify.py`, default `http://localhost:3005`. |

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

## What this adds to FastMCP

`RemoteAuthProvider` publishes the RFC 9728 metadata document and answers
unauthenticated calls with a `WWW-Authenticate` challenge. `JWTVerifier`
validates the signature against a remote JWKS plus `iss`, `aud`, and expiry.
`create_namoid_auth` supplies what is left.

**Discovery.** The JWKS URI and issuer come from
`{issuer}/.well-known/oauth-authorization-server` instead of being hard-coded,
and the document must declare the issuer that was asked for — RFC 9700 mix-up
defence.

**`NamoIDAccessTokenVerifier`** subclasses `JWTVerifier` to add two checks:

- `token_use` must be `access`. `JWTVerifier` has no opinion on it, so an ID
  token for the same audience would otherwise be accepted as an API token.
- `sub` must be present, and it is copied onto `AccessToken.subject`.
  `JWTVerifier` leaves `subject` unset, which would make every caller look like
  the same anonymous principal — per-user checks in tool handlers would then all
  apply to one shared identity.

**`require_namoid_scopes`** rather than FastMCP's built-in `require_scopes`.
The built-in returns a boolean used for *tool filtering*: a caller without the
scope does not see the tool in `tools/list` at all, so the host never learns it
exists and cannot ask the user to approve it. Incremental authorization needs
the opposite — the tool stays visible, and an attempted call answers with an
`insufficient_scope` result naming the missing scopes, the resource, and the
metadata URL.

Use the built-in `require_scopes` when hiding a capability is the goal. Use
`require_namoid_scopes` when the user should be able to grant it.

**Exact issuer strings.** `RemoteAuthProvider` stores authorization servers as
pydantic `AnyHttpUrl`, which appends a trailing slash to a bare-authority URL —
`https://acme-test.id.namoid.in` is serialized as
`https://acme-test.id.namoid.in/`. NamoID's discovery document declares the
issuer without that slash, and RFC 8414 compares issuer identifiers exactly, so
a strict client would see a mismatch; a client that builds the well-known URL by
string concatenation would also produce a double slash. This example serves its
own protected-resource metadata route so the issuer is published verbatim.
Token verification and the `WWW-Authenticate` challenge are inherited unchanged.

Business-rule failures raise `ToolError`, whose message always reaches the
client, rather than a bare exception that FastMCP may mask.

## Connect an MCP client

MCP hosts require HTTPS, so put a tunnel or proxy in front of the local port and
make sure `NAMOID_MCP_RESOURCE` is that public URL. Use a preregistered Client
ID or a Client ID Metadata Document — Dynamic Client Registration does not work
against a customer MCP resource. See [`../README.md`](../README.md#connect-an-mcp-client).

## Docker

```bash
docker compose up --build mcp-fastmcp-python   # from the repository root
```

## What this example is not

State lives in memory and is lost on restart. There is no database, no real
payment system, and no persistence of refunds. The authorization path is the
part worth copying; the domain logic is a placeholder for yours.
