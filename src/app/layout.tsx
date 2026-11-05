import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { Pulse } from "@/components/Pulse.tsx";
import { SideNav } from "@/components/SideNav.tsx";
import { keyFingerprint } from "@/lib/server/keys.ts";
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
  title: "JANG 場: negotiation infrastructure for autonomous agents",
  description:
    "JANG is the layer between agent discovery and agent payment: buyer and seller agents negotiate multi-dimensional terms without revealing their private limits.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/*
 * Clerk ships its own prebuilt screens with a light default, which rendered as
 * invisible text on this page's dark background. These map its variables onto
 * the same tokens the rest of the interface uses.
 */
const clerkAppearance = {
  variables: {
    colorBackground: "#1b2430",
    colorForeground: "#e6ebf1",
    colorText: "#e6ebf1",
    colorNeutral: "#8798a9",
    colorInput: "#0f151d",
    colorPrimary: "#e0a03c",
    colorDanger: "#c65a5a",
    colorSuccess: "#6fbf73",
    colorWarning: "#e0a03c",
    borderRadius: "4px",
    fontFamily: "var(--font-sans), system-ui, sans-serif",
  },
} as const;


/** Navigation only exists once there is an account to navigate. */
async function Rail() {
  const owner = await currentOwner();
  if (!owner) return null;
  return <SideNav isAdmin={owner.isAdmin} />;
}

async function SignedInExtras() {
  const owner = await currentOwner();
  if (!owner) return null;
  return <Pulse />;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ClerkProvider appearance={clerkAppearance}>
          <header className="topbar">
            <Link href="/" className="wordmark">
              JANG<span className="mark">場</span>
            </Link>

            <div className="statusbar" role="status" aria-live="polite">
              <Suspense fallback={null}>
                <SignedInExtras />
              </Suspense>
              {/* Agreements are only as good as knowing which key signed them,
                  and a keyless instance mints a new one on every restart. */}
              <span className="stat-seg" title="The key JANG signs agreements with">
                <span className="stat-value mono">{keyFingerprint()}</span>
                <span className="stat-label">signing key</span>
              </span>
            </div>

            <div className="topbar-account">
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
            </div>
          </header>

          <div className="shell">
            <Suspense fallback={null}>
              <Rail />
            </Suspense>
            <div className="shell-main">{children}</div>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
