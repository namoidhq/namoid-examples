"use client";

import { HostedLoginButton, NamoIDProvider, SignIn, SignUp, Waitlist } from "@namoidhq/react";

const publishableKey = process.env.NEXT_PUBLIC_NAMOID_PUBLISHABLE_KEY ?? "";
const apiBaseUrl = process.env.NEXT_PUBLIC_NAMOID_API_BASE_URL ?? "https://api.namoid.in";
const hostedLoginBaseUrl =
  process.env.NEXT_PUBLIC_NAMOID_HOSTED_LOGIN_URL ?? process.env.NEXT_PUBLIC_NAMOID_ISSUER;
const clientId = process.env.NEXT_PUBLIC_NAMOID_CLIENT_ID ?? "";
const redirectUri =
  process.env.NEXT_PUBLIC_NAMOID_REDIRECT_URI ??
  "http://localhost:3001/api/auth/callback/namoid";

export function SdkDemo() {
  if (!publishableKey) {
    return (
      <section style={cardStyle}>
        <h2 style={headingStyle}>SDK components</h2>
        <p style={mutedStyle}>
          Set <code>NEXT_PUBLIC_NAMOID_PUBLISHABLE_KEY</code> to render the NamoID React
          components.
        </p>
      </section>
    );
  }

  return (
    <NamoIDProvider
      publishableKey={publishableKey}
      apiBaseUrl={apiBaseUrl}
      hostedLoginBaseUrl={hostedLoginBaseUrl}
    >
      <section style={{ display: "grid", gap: 16 }}>
        <div>
          <h2 style={headingStyle}>SDK components</h2>
          <p style={mutedStyle}>
            These cards use <code>@namoidhq/react</code> with your auth publishable key.
          </p>
        </div>
        <div style={gridStyle}>
          <SignIn clientId={clientId} redirectUri={redirectUri} />
          <SignUp clientId={clientId} redirectUri={redirectUri} />
          <Waitlist clientId={clientId} redirectUri={redirectUri} />
        </div>
        <div style={cardStyle}>
          <h3 style={{ ...headingStyle, fontSize: 16 }}>Hosted login launcher</h3>
          <HostedLoginButton clientId={clientId} redirectUri={redirectUri} mode="signin" />
        </div>
      </section>
    </NamoIDProvider>
  );
}

const headingStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 650,
};

const mutedStyle = {
  color: "#525252",
  margin: "6px 0 0",
};

const cardStyle = {
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: 18,
  background: "#ffffff",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};
