# NamoID examples

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Runnable, copy-pasteable integrations for [NamoID](https://namoid.in) — an
OAuth 2.1 + OpenID Connect identity provider. Every example does the same thing
in a different stack: **sign a user in with NamoID, read their profile, sign
them out** — using the standard Authorization Code flow with PKCE.

No example hardcodes endpoint URLs. They all start from your project's **issuer
URL** and use OIDC discovery (`/.well-known/openid-configuration`) to find the
authorize / token / userinfo / jwks endpoints. Point an example at a different
NamoID project by changing one env var.

## Pick your stack

| Example | Language | Framework | OIDC library |
|---|---|---|---|
| [`nextjs-quickstart`](./nextjs-quickstart) | TypeScript | Next.js (App Router) | Auth.js v5 |
| [`node-express`](./node-express) | JavaScript | Express | `openid-client` |
| [`python-flask`](./python-flask) | Python | Flask | Authlib |
| [`python-fastapi`](./python-fastapi) | Python | FastAPI | Authlib |
| [`go-oidc`](./go-oidc) | Go | net/http | `coreos/go-oidc` + `x/oauth2` |
| [`ruby-sinatra`](./ruby-sinatra) | Ruby | Sinatra | `openid_connect` |
| [`php`](./php) | PHP | vanilla | `jumbojett/openid-connect-php` |
| [`java-spring-boot`](./java-spring-boot) | Java | Spring Boot | Spring Security OAuth2 Client |
| [`dotnet-aspnet`](./dotnet-aspnet) | C# | ASP.NET Core | built-in OpenID Connect |
| [`rust-axum`](./rust-axum) | Rust | axum | `openidconnect` |
| [`bash-curl`](./bash-curl) | Shell | — | hand-rolled (learn the raw flow) |

If you just want to *understand* the protocol with zero framework magic, read
[`bash-curl`](./bash-curl) — it runs the whole Authorization Code + PKCE flow
with `curl`, `openssl`, and `jq`.

## One-time setup: create an OAuth client

Every example needs an OAuth client. Create one once and reuse the credentials:

1. Go to [namoid.in](https://namoid.in) → **Projects** → your project →
   **Applications** → **New application**.
2. Set:

   | Field | Value |
   |---|---|
   | Display name | `Local quickstart` |
   | Redirect URI | the example's `NAMOID_REDIRECT_URI` (see its README) |
   | Scopes | `openid`, `profile`, `email` |

3. Save. You'll see the `client_id` (`idpc_test_…`) and a **one-time**
   `client_secret` (`idps_test_…`) — copy both now; the secret is shown once.
4. On the project page, copy your **issuer URL** — your project's hosted
   discovery host, `https://<your-project-slug>.id.namoid.in`.

## Common environment variables

Every example reads the same four NamoID variables (plus a framework session
secret and a port). Copy each example's `.env.example` and fill these in:

```env
NAMOID_ISSUER=https://<your-project-slug>.id.namoid.in
NAMOID_CLIENT_ID=idpc_test_xxxxxxxx
NAMOID_CLIENT_SECRET=idps_test_xxxxxxxx
NAMOID_REDIRECT_URI=http://localhost:<port>/callback
```

> Use the **test** credentials (`idpc_test_…` / `idps_test_…`) for local dev and
> the **live** ones (`idpc_live_…` / `idps_live_…`) in production. The prefix
> tells the two environments apart so you can't accidentally cross them.

## The flow every example implements

1. **`/login`** — generate a PKCE `code_verifier` + S256 `code_challenge`, a
   random `state` and `nonce`, then redirect to the `authorization_endpoint`
   with `response_type=code` and `scope=openid profile email`.
2. **`/callback`** — verify `state`, POST the `code` + `code_verifier` to the
   `token_endpoint` (authenticating with `client_secret_basic`). You get back an
   `access_token`, an `id_token`, and a rotating `refresh_token`.
3. **Validate the `id_token`** (RS256, against `jwks_uri`; check `iss`, `aud`,
   `exp`, `nonce`) and optionally call the `userinfo_endpoint` with the
   `access_token` for `sub` / `email` / `name`.
4. **`/logout`** — clear the local session (and optionally redirect to the
   provider's `end_session_endpoint` with `id_token_hint`).

PKCE is **required** — every flow must send a `code_challenge` (S256). There is
no implicit flow.

## Protocol reference

| Thing | Value |
|---|---|
| Discovery | `<NAMOID_ISSUER>/.well-known/openid-configuration` |
| Grant | `authorization_code` (+ `refresh_token` for rotation) |
| PKCE | required, `S256` only |
| Scopes | `openid`, `profile`, `email`, `phone`, `offline_access` |
| Token auth | `client_secret_basic` or `client_secret_post` |
| ID token alg | RS256 (verify via `jwks_uri`) |
| Refresh tokens | rotate on every use; reuse of an old one revokes the chain |

Full API docs: [docs.namoid.in](https://docs.namoid.in).

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-examples/issues](https://github.com/namoidhq/namoid-examples/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
