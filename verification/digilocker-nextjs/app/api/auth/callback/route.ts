import { demoMode } from "../../../../lib/config";
import { getNamoID } from "../../../../lib/namoid";
import { go, readSession, setSessionCookie } from "../../../../lib/session";
import { createSession, memory } from "../../../../lib/store";
export async function GET(request: Request) {
  if (demoMode())
    return new Response("Real sign-in is disabled in demo mode", {
      status: 404,
    });
  return getNamoID().callback(request, {
    async onSuccess({ identity, tokens }) {
      const old = await readSession();
      if (old) memory.sessions.delete(old.id);
      const session = createSession(
        {
          userId: identity.sub,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
        },
        tokens.expires_in ?? 900,
      );
      await setSessionCookie(session);
      return go("/");
    },
    onError: () => go("/?notice=login_failed"),
  });
}
