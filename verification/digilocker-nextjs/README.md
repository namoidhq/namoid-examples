# Wayfarer: car rental with DigiLocker

A runnable Next.js App Router example of a renter signing in, choosing a car and dates, and sharing issued driving-licence details for rental review through NamoID.

The interface uses a fictional rental company, sample cars, and illustrative prices. It does not reserve a car, collect payment, or approve a rental. Successful document processing is separate from rental eligibility, live suspension checks, licence-class requirements, age/insurance rules, and biometric identity matching.

## Run the local demo

Requires Node.js 22+ and pnpm 10. The DigiLocker SDK changes are currently a preview, so this example builds local snapshots of `@namoidhq/js@3.3.0` and `@namoidhq/nextjs@4.2.0` rather than assuming they are already published.

Check out `namoid-examples` and `namoid-js` next to each other. Use the `feat/digilocker-verification` branch of `namoid-js` and install its dependencies with `pnpm install` first.

```sh
cd namoid-examples/verification/digilocker-nextjs
node scripts/prepare-sdk.mjs
# If the SDK checkout is elsewhere: node scripts/prepare-sdk.mjs /absolute/path/to/namoid-js
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3010. Choose **Try as a demo renter**, pick a car and dates, continue to the licence check, and share the sample licence. You can decline, cancel, refresh status, delete shared details, and start again. No credentials are needed in demo mode.

Demo mode creates a synthetic identity and simulates the NamoID verification API through the actual SDK's fetch transport. It does not contact NamoID or DigiLocker, verify any real document, or exercise the DigiLocker protocol. The simulated sharing screen is labelled clearly. All synthetic records live in process memory and disappear on restart, logout or expiry.

The SDK tarballs are generated under ignored `.sdk/`. The lockfile contains their integrity hashes; use the SDK commit that supplies these versions (`030352f`) for reproducible installation. If you intentionally change the SDK, regenerate the tarballs and update the example lockfile with `pnpm install --no-frozen-lockfile`. Do not commit credentials, SDK build outputs or dependencies. Once these SDK versions are published, remove the two local overrides in `package.json` and regenerate the lockfile to use registry packages.

## Connect an approved NamoID Test application

In `.env.local`, set:

```dotenv
DEMO_MODE=false
NEXT_PUBLIC_APP_URL=http://localhost:3010
NAMOID_CLIENT_ID=your_test_client_id
NAMOID_CLIENT_SECRET=your_server_only_test_client_secret
# For a private deployment only:
# NAMOID_VERIFICATION_API_BASE_URL=https://api.your-namoid-deployment.example
```

Restart the app after changing mode or credentials. Missing configuration fails rather than silently switching to a demo.

Create a confidential **Web** application and register both exact redirect URIs:

- `http://localhost:3010/api/auth/callback` — NamoID sign-in.
- `http://localhost:3010/api/verification/return` — document verification return.

Register `http://localhost:3010/` as a post-logout return URI. Replace these origins with the exact HTTPS app URL when using a deployed test app. Keep credentials server-side; there are no public client-secret variables.

NamoID operators must enable **DigiLocker verification** for this workspace's **Test** realm in **Root admin → Workspaces → Plan & Features**. Application approval, permitted purpose/retention, and an approved client-owned or NamoID-managed DigiLocker credential arrangement are additional requirements. Feature access alone does not authorize document processing. Live access is separate and defaults off.

Set the approved user-facing purpose to the actual rental-review use case. Ensure the executed agreement explicitly covers the requester/client arrangement. NamoID's hosted DigiLocker callback stays on the instance's canonical HTTPS host; do not register the client app's verification return with DigiLocker as its OAuth callback.

The real flow uses the server-side `namoid.verifications` SDK helper after Hosted Auth sign-in. DigiLocker is not a sign-in method and does not require adding a NamoID `phone` scope. Real provider compatibility and legal approval must be tested separately using approved credentials; the local demo passing does not establish either.

## What happens in the rental journey

1. **Sign in:** the SDK handles Hosted Auth state, PKCE, nonce and signed ID-token checks. The app creates a random opaque HttpOnly session cookie. Upstream tokens stay in server memory.
2. **Choose a trip:** the server validates the selected car and real, ordered dates (maximum 30 days). The rental details are kept in the app session, not sent as documents to NamoID.
3. **Start a check:** the backend generates random return state and an idempotency key and binds the returned verification ID to the current renter's session. Retrying the same unfinished attempt reuses the key; a new ended attempt gets a new key.
4. **Share details:** real mode redirects to NamoID's hosted consent/document-selection flow. Demo mode redirects to a local synthetic screen.
5. **Handle return:** the app validates the verification ID and state against the current session before fetching the result with server-only application credentials. Duplicate parameters, a different browser/session and replayed returns are rejected.
6. **Review:** the page shows name, masked licence number and individual document checks. Expired or unknown validity dates require review. A valid document date does not automatically approve a rental or confirm that the document belongs to the signed-in person.
7. **Delete or cancel:** state-changing routes require same-origin POSTs and a session CSRF token. They take the verification ID from the server session; a browser-supplied ID cannot select another renter's result.

The app fetches real results when rendering rather than persisting a second copy. NamoID controls its approved retention period. The sample supports one active verification per application session; it does not implement background webhook processing, reservations or business-rule approval. The production integration exposes reference-only webhooks if your rental backend needs asynchronous processing.

## Files to follow

- `lib/namoid.ts`: SDK setup and explicit demo/real transport selection.
- `lib/session.ts`, `lib/store.ts`: opaque sessions, CSRF, state binding, date checks.
- `app/api/auth/*`: login, callback and logout.
- `app/api/verification/*`: create, return, cancellation and result deletion.
- `lib/demo.ts`: synthetic API transport; no DigiLocker protocol simulation.
- `app/page.tsx`: rental selection and document-review summary.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm test:flow
# Optional browser checks (desktop + mobile):
pnpm exec playwright install chromium
pnpm test:browser
```

The browser checks use an isolated synthetic app and check real form navigation, rental selection, sharing, decline/cancel/delete, and mobile overflow. They also catch browser-specific Origin/referrer-policy behavior. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium/Chrome executable instead of a downloaded browser.

The flow check starts the built app on an isolated local port (3011 by default), drives the real HTTP routes and SDK calls using synthetic data, checks cookie/CSRF/origin and return binding, then deletes, restarts, cancels and signs out. Set `TEST_PORT` if that port is busy.

## Docker

Prepare `.sdk/` first as above, then from the repository root:

```sh
docker compose --profile verification up --build digilocker-rental
```

The service defaults to demo mode and is excluded from the default Compose services. Override `DIGILOCKER_DEMO_MODE`, `DIGILOCKER_APP_URL`, `DIGILOCKER_NAMOID_CLIENT_ID`, `DIGILOCKER_NAMOID_CLIENT_SECRET`, and optionally `DIGILOCKER_VERIFICATION_API_BASE_URL` for an approved real Test instance. Local credential files are excluded from its build context.

## Deployment boundary

This is a single-process reference app. Replace the in-memory store with shared, encrypted TTL-backed storage before deploying replicas or using it with real customer data; restart currently signs everyone out. Add application rate limits, deployment security headers/CSP, operational monitoring and your normal session lifecycle. The sample caps session life at the shorter of the access-token lifetime and 30 minutes and intentionally requires sign-in again instead of implementing refresh-token rotation. It must run on Node.js, not an Edge runtime.

For production rental processing, implement your own reviewed eligibility rules and permissions, consent/purpose/retention policies, and failure handling. Use HTTPS and the exact configured application origin. Do not log upstream tokens, callback query parameters, or licence details. Never deploy demo mode as a real verification service.
