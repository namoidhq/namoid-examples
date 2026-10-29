import { cookies } from "next/headers";
import { demoMode } from "../../../../lib/config";
import { getNamoID, verifications } from "../../../../lib/namoid";
import { authorizedForm, COOKIE, go, rejected } from "../../../../lib/session";
import { memory } from "../../../../lib/store";
export async function POST(request: Request) {
  const auth = await authorizedForm(request);
  if (!auth) return rejected();
  const { session } = auth;
  if (session.pending?.id && !session.pending.returned) {
    try {
      await verifications(session).cancel(session.pending.id);
    } catch {
      /* NamoID expiry and its cleanup worker remain the fallback. */
    }
  }
  memory.sessions.delete(session.id);
  (await cookies()).delete(COOKIE);
  if (demoMode()) return go("/");
  try {
    return await getNamoID().logout({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      idTokenHint: session.idToken,
    });
  } catch {
    return go("/?notice=logout_local");
  }
}
