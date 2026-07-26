import { validateAuthToken } from "@namoidhq/js/server";
import { cookies } from "next/headers";

export type NamoIDSession = {
  accessToken: string;
  userId: string;
  sessionId: string | null;
};

export async function readNamoIDSession(): Promise<NamoIDSession | null> {
  const accessToken = (await cookies()).get("namoid_access_token")?.value;
  const clientId = process.env.NAMOID_CLIENT_ID;
  const clientSecret = process.env.NAMOID_CLIENT_SECRET;
  if (!accessToken || !clientId || !clientSecret) return null;

  try {
    const result = await validateAuthToken({
      token: accessToken,
      clientId,
      clientSecret,
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
