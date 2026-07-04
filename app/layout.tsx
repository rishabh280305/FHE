import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CipherPulse | Confidential Analytics OS",
  description: "Confidential Analytics OS for Web3 protocols, DAOs and on-chain communities."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
