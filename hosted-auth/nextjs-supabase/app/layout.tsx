import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "NamoID Hosted Auth with Supabase",
  description: "Use NamoID for authentication and Supabase for application data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          color: "#0a0a0a",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          lineHeight: 1.5,
          margin: "48px auto",
          maxWidth: 680,
          padding: "0 20px",
        }}
      >
        {children}
      </body>
    </html>
  );
}
