/**
 * Protect every route except the landing page and Auth.js's own endpoints.
 * Unauthenticated requests are redirected to /api/auth/signin which kicks off
 * the OIDC flow against NamoID.
 */

export { auth as middleware } from "@/auth";

export const config = {
  // Match everything except: api/auth/* (Auth.js), _next assets, favicon, the
  // landing page (/).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon|$).*)"],
};
