/**
 * Protected dashboard. Middleware ensures only authenticated requests reach
 * this page — if you got here, `auth()` will return a session.
 */

import { auth, signOut } from "@/auth";

export default async function Dashboard() {
  const session = await auth();

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Dashboard</h1>
      <p style={{ marginBottom: 16 }}>
        You're authenticated via NamoID. Here's what the session looks like —
        this is what your real app would use:
      </p>

      <pre
        style={{
          padding: 16,
          background: "#f5f5f5",
          border: "1px solid #e5e5e5",
          borderRadius: 8,
          fontSize: 12,
          overflow: "auto",
        }}
      >
        <code>{JSON.stringify(session, null, 2)}</code>
      </pre>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        style={{ marginTop: 24 }}
      >
        <button
          type="submit"
          style={{
            fontSize: 14,
            padding: "8px 16px",
            borderRadius: 8,
            background: "white",
            color: "#0a0a0a",
            border: "1px solid #d4d4d4",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
