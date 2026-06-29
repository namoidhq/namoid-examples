# Raw flow (curl) + NamoID quickstart

The OAuth 2.1 Authorization Code + PKCE flow run by hand, with `curl`,
`openssl`, and `jq` — no libraries. Read this to understand what every other
example in this repo automates for you.

## What you get (each curl maps to one step of the spec)

A single, heavily-commented script, `login.sh`, that walks the full login
flow and echoes every HTTP request:

- **Discovery** — `GET /.well-known/openid-configuration` (OIDC Discovery 1.0)
- **PKCE** — generate `code_verifier` + S256 `code_challenge` (RFC 7636)
- **Authorize** — build the URL you open in a browser (RFC 6749 §4.1)
- **Token** — exchange the `code` for tokens with `client_secret_basic` + PKCE
- **Decode id_token** — read the JWT claims (display only)
- **UserInfo** — call the protected endpoint with the access token

Nothing is hardcoded: the endpoints come from the discovery document.

## Run it locally (5 minutes)

### 1. Create an OAuth client in NamoID

Go to https://namoid.in → Projects → your project → Applications →
New application. Use these values:

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3011/callback` |
| Scopes | `openid`, `profile`, `email` |

Save → copy the `client_id`, the one-time `client_secret`, and your project's
issuer URL (`https://<your-project-slug>.id.namoid.in`).

No server runs on port 3011 — after sign-in you'll copy the `code` straight
out of the browser address bar.

### 2. Configure

```bash
cd examples/bash-curl
cp .env.example .env
```

Fill in the four `NAMOID_` vars in `.env`. You need `curl`, `openssl`, and
`jq` installed (`jq --version`, `openssl version`, `curl --version`).

### 3. Run

```bash
chmod +x login.sh
./login.sh
```

Follow the printed instructions: open the authorize URL, sign in, copy the
`code` from the redirect address bar, paste it back. The script prints the
tokens, the decoded id_token claims, and your UserInfo profile.

## How it works

1. **Discovery** — `curl` the issuer's `/.well-known/openid-configuration` and
   `jq` out `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`,
   and `jwks_uri`.
2. **PKCE** — `openssl rand` makes a random `code_verifier`; its SHA-256 hash,
   base64url-encoded, is the `code_challenge` (method `S256`). `state` and
   `nonce` are random hex.
3. **Authorize** — assemble the authorize URL with `response_type=code`, the
   client id, redirect URI, scope, state, nonce, and the challenge. You open
   it in a browser.
4. **Token** — `curl -u client_id:client_secret` POSTs `grant_type=`
   `authorization_code` with the `code` and the `code_verifier`. The verifier
   proves this is the same client that started the flow.
5. **Decode id_token** — split the JWT on `.`, base64url-decode the payload,
   `jq` the claims.
6. **UserInfo** — `curl` the userinfo endpoint with
   `Authorization: Bearer <access_token>`.

Each of these is exactly one `curl` invocation in the script.

## A note on verification

This script **decodes** the id_token for display only — it does **not** verify
the signature. A production client must **verify** the RS256 signature against
the provider's public keys at `jwks_uri`, and check `iss` / `aud` / `exp` /
`nonce`, before trusting any claim. The library-based examples in this repo
(e.g. `nextjs-quickstart`, `python-fastapi`, `go-oidc`) do that verification
for you. Never trust an unverified JWT in real code.

## Troubleshooting

- **Redirect URI mismatch** — the `NAMOID_REDIRECT_URI` in `.env` must be
  character-for-character identical to a Redirect URI registered on the
  application (default `http://localhost:3011/callback`).
- **`invalid_client`** — wrong `client_secret`, or the basic-auth header is
  malformed. Double-check `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`.
- **`invalid_grant`** — the `code` was already used or has expired (they're
  single-use and short-lived), or the `code_verifier` doesn't match the
  `code_challenge` you sent. Re-run the script to get a fresh code.
- **Discovery fails / `iss` mismatch** — `NAMOID_ISSUER` must be the project's
  hosted issuer with **no trailing slash**. A trailing slash produces a
  double-slash `//.well-known` URL and a mismatched `iss` claim.
