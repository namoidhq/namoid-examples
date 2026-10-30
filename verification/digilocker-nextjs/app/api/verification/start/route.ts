import { appUrl } from "../../../../lib/config";
import { verifications } from "../../../../lib/namoid";
import { authorizedForm, go, rejected } from "../../../../lib/session";
import { randomSecret, validateTrip } from "../../../../lib/store";
export async function POST(request: Request) {
  const auth = await authorizedForm(request);
  if (!auth) return rejected();
  const { session, data } = auth;
  const trip = validateTrip(data);
  if (!trip) return go("/?notice=invalid_trip");
  // Reuse an unfinished transaction and its idempotency key when a network reply
  // is lost. A completed/declined/cancelled attempt gets a fresh transaction.
  if (session.pending?.returned) session.pending = undefined;
  if (
    session.trip &&
    session.pending &&
    JSON.stringify(session.trip) !== JSON.stringify(trip)
  )
    return go("/?notice=cancel_first");
  if (!session.pending)
    session.pending = {
      state: randomSecret(),
      key: randomSecret(),
      returned: false,
    };
  session.trip = trip;
  try {
    const result = await verifications(session).create({
      userAccessToken: session.accessToken,
      returnUri: appUrl() + "/api/verification/return",
      state: session.pending.state,
      idempotencyKey: session.pending.key,
    });
    session.pending.id = result.id;
    session.verificationId = result.id;
    if (!result.hosted_url) return go("/?notice=resume_existing");
    return new Response(null, {
      status: 303,
      headers: { location: result.hosted_url, "Cache-Control": "no-store" },
    });
  } catch {
    return go("/?notice=setup_required");
  }
}
