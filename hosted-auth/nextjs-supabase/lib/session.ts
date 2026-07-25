import { validateAuthToken } from "@namoidhq/js/server";
import { cookies } from "next/headers";

export type NamoIDSession = {
  accessToken: string;
  userId: string;
  sessionId: string | null;
};

export async function readNamoIDSession(): Promise<NamoIDSession | null> {
  const accessToken = (await cookies()).get("namoid_access_token")?.value;
  const authSecretKey = process.env.NAMOID_AUTH_SECRET_KEY;
  if (!accessToken || !authSecretKey) return null;

  try {
    const result = await validateAuthToken({
      token: accessToken,
      apiKey: authSecretKey,
      apiBaseUrl: process.env.NAMOID_API_BASE_URL,
    });
    if (!result.valid || !result.user_id) return null;
    return {
      accessToken,
      userId: result.user_id,
      sessionId: result.session_id,
    };
  } catch {
    return null;
  }
}
