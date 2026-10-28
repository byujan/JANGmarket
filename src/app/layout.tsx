import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";

export const metadata: Metadata = {
  title: "JANG 場 — negotiation infrastructure for autonomous agents",
  description:
    "JANG is the layer between agent discovery and agent payment: buyer and seller agents negotiate multi-dimensional terms without revealing their private limits.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "#0b0d10",
          color: "#e6e8eb",
        }}
      >
        <ClerkProvider>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "1rem 1.5rem",
              borderBottom: "1px solid #1e242c",
            }}
          >
            <a href="/" style={{ color: "inherit", textDecoration: "none", fontWeight: 700 }}>
              JANG 場
            </a>
            <nav style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {/* Show reads the request, so it needs a Suspense boundary here. */}
              <Suspense fallback={null}>
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton />
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </Suspense>
            </nav>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
