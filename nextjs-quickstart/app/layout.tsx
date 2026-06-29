import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "NamoID Quickstart — Next.js",
  description: "Minimal example of integrating NamoID OAuth/OIDC into a Next.js app.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          maxWidth: 640,
          margin: "32px auto",
          padding: "0 16px",
          color: "#0a0a0a",
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
