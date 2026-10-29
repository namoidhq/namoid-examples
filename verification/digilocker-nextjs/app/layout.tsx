import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./style.css";
export const metadata: Metadata = {
  title: "Wayfarer · A little further",
  description:
    "Car-rental example with NamoID sign-in and DigiLocker driving-licence verification.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
