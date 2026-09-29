import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kensington Heavy Ballers | 6-a-side football",
  description: "Football, friendship and a healthier you. Tuesday and Saturday football leagues in Kensington, Liverpool.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/assets/kensington-heavy-ballers-logo.webp",
    shortcut: "/assets/kensington-heavy-ballers-logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
