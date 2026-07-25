import { cookies } from "next/headers";
import Link from "next/link";

export default async function Dashboard() {
  const store = await cookies();
  const userId = store.get("namoid_user_id")?.value;

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Dashboard</h1>
      <p style={{ marginBottom: 16 }}>
        {userId ? "You're authenticated via NamoID Hosted Auth." : "No app session is present yet."}
      </p>
      <pre style={{ padding: 16, background: "#f5f5f5", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 12 }}>
        <code>{JSON.stringify({ user_id: userId ?? null }, null, 2)}</code>
      </pre>
      <p style={{ marginTop: 24 }}>
        <Link href="/api/auth/logout">Sign out</Link>
      </p>
    </main>
  );
}
