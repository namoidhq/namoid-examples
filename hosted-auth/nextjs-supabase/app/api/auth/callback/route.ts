import { cookies } from "next/headers";
import { getNamoID } from "../../../../lib/namoid";

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
      return Response.redirect(new URL("/dashboard", request.url));
    },
  });
