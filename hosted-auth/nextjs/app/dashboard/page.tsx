import Link from "next/link";
import { readNamoIDSession } from "../../lib/session";

export default async function Dashboard() {
  const session = await readNamoIDSession();

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Dashboard</h1>
      <p style={{ marginBottom: 16 }}>
        {session ? "You're authenticated via NamoID Hosted Auth." : "No valid app session is present yet."}
      </p>
      <pre style={{ padding: 16, background: "#f5f5f5", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 12 }}>
        <code>{JSON.stringify({ user_id: session?.userId ?? null }, null, 2)}</code>
      </pre>
      {session ? (
        <p style={{ marginTop: 24 }}>
          <Link href="/api/auth/logout">Sign out</Link>
        </p>
      ) : (
        <p style={{ marginTop: 24 }}>
          <Link href="/api/auth/login">Sign in</Link>
        </p>
      )}
    </main>
  );
}
