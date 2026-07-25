import Link from "next/link";
import { readNamoIDSession } from "../lib/session";

export default async function Home() {
  const session = await readNamoIDSession();

  return (
    <main>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
        NamoID + Next.js + Supabase
      </h1>
      <p style={{ color: "#525252", marginBottom: 24 }}>
        NamoID handles authentication. Trusted Next.js server code stores
        user-owned application data in Supabase.
      </p>
      <p>
        <Link href={session ? "/dashboard" : "/api/auth/login"}>
          {session ? "Open your profile →" : "Sign in with NamoID →"}
        </Link>
      </p>
    </main>
  );
}
