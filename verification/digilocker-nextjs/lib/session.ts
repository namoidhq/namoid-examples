import { cookies } from "next/headers";
import { appUrl } from "./config";
import { findSession, sameSecret, type AppSession } from "./store";
export const COOKIE = "wayfarer_session";
export async function readSession(): Promise<AppSession | null> {
  return findSession((await cookies()).get(COOKIE)?.value);
}
export async function setSessionCookie(session: AppSession): Promise<void> {
  (await cookies()).set(COOKIE, session.id, {
    httpOnly: true,
    secure: appUrl().startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
}
export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === appUrl();
}
export async function authorizedForm(
  request: Request,
): Promise<{ session: AppSession; data: FormData } | null> {
  if (!sameOrigin(request)) return null;
  const session = await readSession();
  if (!session) return null;
  const data = await request.formData();
  const csrf = data.get("csrf");
  if (typeof csrf !== "string" || !sameSecret(csrf, session.csrf)) return null;
  return { session, data };
}
export function go(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(path, appUrl()).toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function rejected(): Response {
  return new Response(
    "This request could not be verified. Return to the rental page and try again.",
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
