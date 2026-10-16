import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kobolt · Verified creator escrow",
  description: "Brands pay creators the moment the work is verified.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
