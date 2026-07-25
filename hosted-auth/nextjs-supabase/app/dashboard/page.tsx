import Link from "next/link";
import { redirect } from "next/navigation";
import { readNamoIDSession } from "../../lib/session";
import { getSupabaseServerClient } from "../../lib/supabase";
import { saveProfile } from "./actions";

export default async function Dashboard() {
  const session = await readNamoIDSession();
  if (!session) redirect("/");

  const { data: profile, error } = await getSupabaseServerClient()
    .from("namoid_profiles")
    .select("display_name, updated_at")
    .eq("namoid_user_id", session.userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load profile: ${error.message}`);

  return (
    <main>
      <p style={{ color: "#06735c", fontWeight: 600 }}>Authenticated by NamoID</p>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Supabase-backed profile</h1>
      <p style={{ color: "#525252", marginBottom: 24 }}>
        This row is loaded by trusted server code and scoped to the validated
        NamoID user ID.
      </p>

      <form action={saveProfile}>
        <label htmlFor="display_name" style={{ display: "block", fontWeight: 600 }}>
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={profile?.display_name ?? ""}
          maxLength={80}
          required
          style={{ boxSizing: "border-box", margin: "8px 0 12px", padding: 12, width: "100%" }}
        />
        <button type="submit" style={{ padding: "10px 16px" }}>
          Save in Supabase
        </button>
      </form>

      <pre style={{ background: "#f5f5f5", marginTop: 24, padding: 16 }}>
        <code>
          {JSON.stringify(
            {
              namoid_user_id: session.userId,
              profile: profile ?? null,
            },
            null,
            2,
          )}
        </code>
      </pre>

      <p style={{ marginTop: 24 }}>
        <Link href="/api/auth/logout">Sign out</Link>
      </p>
    </main>
  );
}
