/**
 * Public landing page. Shows a Sign-in button. If the user is already signed
 * in, links them straight to /dashboard.
 */

import { auth, signIn } from "@/auth";
import Link from "next/link";
import { SdkDemo } from "./sdk-demo";

export default async function Home() {
  const session = await auth();

  return (
    <main>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
        NamoID + Next.js quickstart
      </h1>
      <p style={{ color: "#525252", marginBottom: 24 }}>
        Minimal example showing the OAuth/OIDC flow. Click sign-in and you'll be
        redirected to your NamoID instance, authenticate there, then come back
        to <code>/dashboard</code>.
      </p>

      {session?.user ? (
        <p>
          Signed in as <strong>{session.user.email ?? session.user.name}</strong>{" "}
          —{" "}
          <Link href="/dashboard" style={{ color: "#0a0a0a", fontWeight: 500 }}>
            Go to dashboard →
          </Link>
        </p>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("namoid", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            style={{
              fontSize: 14,
              fontWeight: 500,
              padding: "10px 20px",
              borderRadius: 8,
              background: "#0a0a0a",
              color: "white",
              border: 0,
              cursor: "pointer",
            }}
          >
            Sign in with NamoID
          </button>
        </form>
      )}

      <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid #e5e5e5" }} />
      <SdkDemo />
      <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid #e5e5e5" }} />
      <p style={{ fontSize: 12, color: "#737373" }}>
        Issuer:{" "}
        <code>{process.env.NAMOID_ISSUER ?? "https://api.namoid.in"}</code>
        <br />
        Client ID: <code>{process.env.NAMOID_CLIENT_ID ?? "(unset)"}</code>
      </p>
    </main>
  );
}
