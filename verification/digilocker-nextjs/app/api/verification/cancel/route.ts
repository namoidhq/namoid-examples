import { verifications } from "../../../../lib/namoid";
import { authorizedForm, go, rejected } from "../../../../lib/session";
export async function POST(request: Request) {
  const auth = await authorizedForm(request);
  if (!auth) return rejected();
  const { session } = auth;
  // The session supplies the ID; the browser cannot choose another renter's ID.
  if (!session.verificationId) return go("/");
  try {
    await verifications(session).cancel(session.verificationId);
    if (session.pending) session.pending.returned = true;
    return go("/?notice=cancelled");
  } catch {
    return go("/?notice=verification_unavailable");
  }
}
