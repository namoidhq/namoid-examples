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
      store.set("namoid_user_id", String(tokens.user_id ?? ""), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: tokens.expires_in ?? 600,
      });
      return Response.redirect(new URL("/dashboard", request.url));
    },
  });
