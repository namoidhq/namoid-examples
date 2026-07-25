import { cookies } from "next/headers";
import { getNamoID } from "../../../../lib/namoid";

export const GET = async () => {
  const store = await cookies();
  const accessToken = store.get("namoid_access_token")?.value;
  store.delete("namoid_access_token");
  return getNamoID().logout({ accessToken });
};
