import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "NammaVandi AI | Your neighbourhood, connected",
  description: "Your trusted street vendor. Now just a WhatsApp message away.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
