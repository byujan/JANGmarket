import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "JANG 場 — negotiation infrastructure for autonomous agents",
  description:
    "JANG is the layer between agent discovery and agent payment: buyer and seller agents negotiate multi-dimensional terms without revealing their private limits.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
