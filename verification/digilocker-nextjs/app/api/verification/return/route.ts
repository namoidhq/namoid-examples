import { verifications } from "../../../../lib/namoid";
import { go, readSession } from "../../../../lib/session";
import { validReturn } from "../../../../lib/store";
export async function GET(request: Request) {
  const session = await readSession();
  const query = new URL(request.url).searchParams;
  const ids = query.getAll("verification_id"),
    states = query.getAll("state");
  if (
    !session ||
    ids.length !== 1 ||
    states.length !== 1 ||
    !validReturn(session, ids[0], states[0])
  ) {
    return new Response(
      "Verification return does not match this rental session.",
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await verifications(session).get(ids[0]);
    if (result.id !== session.pending!.id) throw new Error("Session mismatch");
    session.pending!.returned = true;
    return go("/?notice=returned");
  } catch {
    return go("/?notice=verification_unavailable");
  }
}
