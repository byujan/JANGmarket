import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { currentOwner } from "@/lib/server/owner.ts";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JANG 場 — negotiation infrastructure for autonomous agents",
  description:
    "JANG is the layer between agent discovery and agent payment: buyer and seller agents negotiate multi-dimensional terms without revealing their private limits.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Only shown to signed-in people, and the operator link only to operators. */
async function Nav() {
  const owner = await currentOwner();
  if (!owner) return null;
  return (
    <>
      <a href="/app">Console</a>
      <a href="/app/agents">Agents</a>
      <a href="/app/negotiations">Negotiations</a>
      {owner.isAdmin ? <a href="/admin">Operations</a> : null}
    </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ClerkProvider>
          <header className="topbar">
            <a href="/" className="wordmark">
              JANG 場
            </a>
            <nav className="topnav">
              {/* These read the request, so they need their own boundary.
                  The nav gets no placeholder: it renders nothing at all when
                  signed out, so reserving width would only trade one shift
                  for another. The avatar slot is always filled, so holding
                  its space is safe. */}
              <Suspense fallback={null}>
                <Nav />
              </Suspense>
              <Suspense fallback={<span className="nav-hold nav-hold-avatar" />}>
                <Show when="signed-out">
                  {/* Clerk renders a bare <button> unless given its own child. */}
                  <SignInButton>
                    <button className="button button-quiet">Sign in</button>
                  </SignInButton>
                  <SignUpButton>
                    <button className="button">Create account</button>
                  </SignUpButton>
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
