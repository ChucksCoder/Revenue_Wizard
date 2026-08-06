import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coder Revenue Hub",
  description: "ASC 606 revenue recognition, rollforwards and audit-ready exports",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
