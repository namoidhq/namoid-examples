# NamoID examples

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Official, runnable examples for integrating [NamoID Hosted Auth](https://namoid.in).

## Supported example

| Example | Stack | Packages |
|---|---|---|
| [`nextjs-quickstart`](./nextjs-quickstart) | Next.js App Router | `@namoidhq/nextjs` 1.1+, `@namoidhq/js` 1.1+ |

The quickstart demonstrates the complete server-side Hosted Auth flow:

1. Start a state-bound sign-in transaction.
2. Redirect the browser to the application’s NamoID-hosted sign-in page.
3. Exchange the returned one-time code on the server.
4. Validate the NamoID access token.
5. Create an HttpOnly application session.
6. Revoke the NamoID session during sign-out.

## Configuration

Hosted Auth integrations do not copy an application ID, issuer, client ID,
OAuth scopes, or Hosted Auth URL into application code.

The application is selected by its key:

- `namoid_auth_pk_…` — publishable key for browser and React integrations.
- `namoid_auth_sk_…` — server-only Auth secret key used by the Next.js SDK.

For the Next.js example, only the server-side Auth secret key is required.
The SDK reads the key’s browser-safe configuration and resolves the correct
application and Hosted Auth domain automatically.

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-examples/issues](https://github.com/namoidhq/namoid-examples/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
