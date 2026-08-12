import { createNamoIDNextClient } from "@namoidhq/nextjs";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getNamoID() {
  return createNamoIDNextClient({
    clientId: required("NAMOID_CLIENT_ID"),
    clientSecret: required("NAMOID_CLIENT_SECRET"),
    appBaseUrl: getAppBaseUrl(),
    callbackPath: "/api/auth/callback",
    postLoginRedirectPath: "/dashboard",
    postLogoutRedirectPath: "/",
  });
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
}
