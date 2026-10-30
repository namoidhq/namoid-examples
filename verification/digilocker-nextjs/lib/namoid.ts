import { createNamoIDNextClient } from "@namoidhq/nextjs";
import { appUrl, demoMode, required } from "./config";
import { demoClient } from "./demo";
import type { AppSession } from "./store";
export function getNamoID() {
  return createNamoIDNextClient({
    clientId: required("NAMOID_CLIENT_ID"),
    clientSecret: required("NAMOID_CLIENT_SECRET"),
    appBaseUrl: appUrl(),
    callbackPath: "/api/auth/callback",
    postLoginRedirectPath: "/",
    postLogoutRedirectPath: "/",
    verificationApiBaseUrl:
      process.env.NAMOID_VERIFICATION_API_BASE_URL || undefined,
  });
}
export function verifications(session: AppSession) {
  return demoMode() ? demoClient(session, appUrl()) : getNamoID().verifications;
}
