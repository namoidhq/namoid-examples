import { createNamoIDClient } from "@namoidhq/js";
import { cookies } from "next/headers";

export type NamoIDSession = {
  accessToken: string;
  userId: string;
};

export async function readNamoIDSession(): Promise<NamoIDSession | null> {
  const accessToken = (await cookies()).get("namoid_access_token")?.value;
  if (!accessToken) return null;

  try {
    const clientId = process.env.NAMOID_CLIENT_ID;
    if (!clientId) return null;
    const identity = await createNamoIDClient({ clientId }).hostedAuth.userInfo(accessToken);
    return {
      accessToken,
      userId: identity.sub,
    };
  } catch {
    return null;
  }
}
