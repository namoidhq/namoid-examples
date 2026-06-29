# .NET (ASP.NET Core) + NamoID quickstart

Sign users in with NamoID using the built-in ASP.NET Core `OpenIdConnect` handler — Authority discovery, Authorization Code + PKCE (S256), and cookie sessions, in a single-file minimal API.

## What you get

- `GET /` — home page: shows your name + email when signed in, otherwise a "Sign in" link
- `GET /profile` — protected (`.RequireAuthorization()`) endpoint that returns your `sub` / `email` / `name` claims as JSON
- `GET /logout` — clears the local cookie and signs out at NamoID

## Run it locally (5 minutes)

### 1. Create an OAuth client in NamoID

Go to <https://namoid.in> → **Projects** → your project → **Applications** → **New application**.

| Field | Value |
|---|---|
| Display name | `Local quickstart` |
| Redirect URI | `http://localhost:3009/signin-oidc` |
| Scopes | `openid`, `profile`, `email` |

Copy the **client_id**, the **one-time client secret**, and the **issuer URL**.

> The callback path is `/signin-oidc` — that's the ASP.NET Core `OpenIdConnect` handler's default `CallbackPath`. The redirect URI you register must match it exactly.

### 2. Configure this app

Export the four `NAMOID_` env vars (see `.env.example`):

```bash
export NAMOID_ISSUER="https://namoid.in/v1/oauth"
export NAMOID_CLIENT_ID="your-client-id"
export NAMOID_CLIENT_SECRET="your-client-secret"
export NAMOID_REDIRECT_URI="http://localhost:3009/signin-oidc"
```

`NAMOID_REDIRECT_URI` is documentation only — the handler derives the callback from `CallbackPath` — but keep it in sync with what you registered.

### 3. Install + run

```bash
dotnet run
```

Open <http://localhost:3009>, click **Sign in with NamoID**, complete the flow, and you'll land on `/profile`.

## How it works

Everything lives in `Program.cs`:

- `AddOpenIdConnect(...)` with `options.Authority = NAMOID_ISSUER` triggers OIDC **discovery** — the handler fetches `<issuer>/.well-known/openid-configuration` and the JWKS, so you never hardcode authorize/token/userinfo URLs or signing keys.
- `options.ResponseType = "code"` + `options.UsePkce = true` is the **Authorization Code flow with PKCE (S256)** — mandatory on NamoID.
- `options.ClientSecret` makes this a **confidential client**; the secret is sent on the back-channel token exchange.
- `options.SaveTokens = true` stores the id/access/refresh tokens in the auth cookie.
- `options.GetClaimsFromUserInfoEndpoint = true` enriches the principal from the `/userinfo` endpoint.
- The handler **validates the id_token** (signature via JWKS, `iss`, `aud`, expiry) against discovery before issuing the local cookie.

## Production deployment

- Use your live NamoID client credentials (a separate application from the local one).
- Register an **https** redirect URI, e.g. `https://your-app.com/signin-oidc`, and serve the app over HTTPS so the auth cookie is `Secure`.
- Keep `NAMOID_CLIENT_SECRET` in your platform's secret store, never in source control.

## Troubleshooting

- **`redirect_uri` mismatch** — the URI registered in NamoID must be exactly `http://localhost:3009/signin-oidc` (note the `/signin-oidc` path, not `/`). It must match scheme, host, port, and path.
- **`invalid_client`** — wrong `NAMOID_CLIENT_ID` / `NAMOID_CLIENT_SECRET`, or the secret was rotated. Issue a fresh secret in NamoID.
- **Discovery / `iss` errors** — `NAMOID_ISSUER` must match the `iss` value NamoID returns. A trailing-slash mismatch (`.../oauth` vs `.../oauth/`) will fail validation; copy the issuer exactly as shown.
- **"Correlation failed"** — the PKCE/state cookie was lost between the challenge and the callback. Don't switch hosts/ports mid-flow, allow cookies for `localhost`, and retry from `/login`.
