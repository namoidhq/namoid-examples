import { demoMode } from "../../../../lib/config";
import { getNamoID } from "../../../../lib/namoid";
import {
  go,
  readSession,
  sameOrigin,
  setSessionCookie,
  rejected,
} from "../../../../lib/session";
import { createSession, memory, randomSecret } from "../../../../lib/store";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return rejected();
  if (!demoMode()) return getNamoID().login();
  const old = await readSession();
  if (old) memory.sessions.delete(old.id);
  const session = createSession(
    { userId: "synthetic-renter", accessToken: randomSecret() },
    1800,
  );
  await setSessionCookie(session);
  return go("/");
}
