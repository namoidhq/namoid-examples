/**
 * Auth.js v5 (NextAuth) configuration — wires NamoID as a generic OIDC provider.
 *
 * The Discovery URL (`<issuer>/v1/oauth/.well-known/openid-configuration`)
 * tells Auth.js everything else: endpoints, supported scopes, JWKS for token
 * verification, etc. We never have to hardcode endpoint URLs.
 */

import NextAuth from "next-auth";

const NAMOID_ISSUER = process.env.NAMOID_ISSUER;
if (!NAMOID_ISSUER) {
  throw new Error(
    "NAMOID_ISSUER is not set. Set it to your project's hosted issuer in .env.local " +
      "(https://<your-project-slug>.id.namoid.in).",
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: "namoid",
      name: "NamoID",
      type: "oidc",
      issuer: NAMOID_ISSUER,
      clientId: process.env.NAMOID_CLIENT_ID,
      clientSecret: process.env.NAMOID_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid profile email",
        },
      },
      // Auth.js auto-uses PKCE for OIDC providers; nothing else to configure.
    },
  ],
  callbacks: {
    // Pass the NamoID user_id (sub) through to the session so the app can use it.
    async jwt({ token, profile }) {
      if (profile?.sub) {
        token.sub = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

// Augment the session.user type with the NamoID id.
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
