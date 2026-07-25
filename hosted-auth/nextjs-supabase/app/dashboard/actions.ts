"use server";

import { revalidatePath } from "next/cache";
import { readNamoIDSession } from "../../lib/session";
import { getSupabaseServerClient } from "../../lib/supabase";

export async function saveProfile(formData: FormData): Promise<void> {
  const session = await readNamoIDSession();
  if (!session) throw new Error("Authentication required");

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName || displayName.length > 80) {
    throw new Error("Display name must contain between 1 and 80 characters");
  }

  const { error } = await getSupabaseServerClient()
    .from("namoid_profiles")
    .upsert(
      {
        namoid_user_id: session.userId,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "namoid_user_id" },
    );

  if (error) throw new Error(`Unable to save profile: ${error.message}`);
  revalidatePath("/dashboard");
}
