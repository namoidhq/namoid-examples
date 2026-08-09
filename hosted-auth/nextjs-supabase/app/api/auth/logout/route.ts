import { cookies } from "next/headers";
import { getNamoID } from "../../../../lib/namoid";

export const GET = async () => {
  const store = await cookies();
  const accessToken = store.get("namoid_access_token")?.value;
  const refreshToken = store.get("namoid_refresh_token")?.value;
  const idTokenHint = store.get("namoid_id_token")?.value;
  store.delete("namoid_access_token");
  store.delete("namoid_refresh_token");
  store.delete("namoid_id_token");
  return getNamoID().logout({ accessToken, refreshToken, idTokenHint });
};
