import { cookies } from "next/headers";
import { getAppBaseUrl, getNamoID } from "../../../../lib/namoid";

export const GET = (request: Request) =>
  getNamoID().callback(request, {
    async onSuccess({ tokens }) {
      const store = await cookies();
      const cookie = {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      } as const;
      store.set("namoid_access_token", tokens.access_token, {
        ...cookie,
        maxAge: tokens.expires_in ?? 900,
      });
      if (tokens.refresh_token) {
        store.set("namoid_refresh_token", tokens.refresh_token, cookie);
      }
      if (tokens.id_token) {
        store.set("namoid_id_token", tokens.id_token, cookie);
      }
      // Use an explicitly mutable Headers object. The NamoID SDK clears its
      // short-lived transaction cookies after this callback returns; headers
      // created by Response.redirect() are immutable in some runtimes.
      return new Response(null, {
        status: 302,
        headers: new Headers({ location: new URL("/dashboard", getAppBaseUrl()).toString() }),
      });
    },
  });
