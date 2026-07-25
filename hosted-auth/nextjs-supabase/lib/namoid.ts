import { createNamoIDNextClient } from "@namoidhq/nextjs";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getNamoID() {
  return createNamoIDNextClient({
    authSecretKey: required("NAMOID_AUTH_SECRET_KEY"),
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002",
    apiBaseUrl: process.env.NAMOID_API_BASE_URL,
    callbackPath: "/api/auth/callback",
    postLoginRedirectPath: "/dashboard",
    postLogoutRedirectPath: "/",
  });
}
