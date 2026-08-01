import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
        NamoID + Next.js quickstart
      </h1>
      <p style={{ color: "#525252", marginBottom: 24 }}>
        Minimal example showing NamoID Hosted Auth. Authenticate on the hosted
        page, then return to <code>/dashboard</code>.
      </p>
      <p>
        <Link href="/api/auth/login" style={{ color: "#0a0a0a", fontWeight: 500 }}>
          Sign in →
        </Link>
      </p>
      <p style={{ color: "#737373", fontSize: 14, marginTop: 12 }}>
        Secured by NamoID
      </p>
      <p>
        <Link href="/dashboard" style={{ color: "#0a0a0a", fontWeight: 500 }}>
          Go to dashboard →
        </Link>
      </p>
    </main>
  );
}
