import { cookies } from "next/headers";
import { getNamoID } from "../../../../lib/namoid";

export const GET = (request: Request) =>
  getNamoID().callback(request, {
    async onSuccess({ tokens }) {
      const store = await cookies();
      store.set("namoid_access_token", tokens.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: tokens.expires_in ?? 600,
      });
      // Use an explicitly mutable Headers object. The NamoID SDK clears its
      // short-lived transaction cookies after this callback returns; headers
      // created by Response.redirect() are immutable in some runtimes.
      return new Response(null, {
        status: 302,
        headers: new Headers({ location: new URL("/dashboard", request.url).toString() }),
      });
    },
  });
