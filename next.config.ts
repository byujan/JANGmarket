import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is a package-lock.json in the parent directory, outside this repo,
  // which makes the workspace root ambiguous. Pin it to this project.
  turbopack: { root: import.meta.dirname },
  // Set by `next upgrade --agent=security` when moving off 16.4.3, which a
  // published advisory affected. It records that the security upgrade was
  // taken, so the toolchain stops interrupting builds to recommend it.
  experimental: { agentUpgrade: "security" },
};

export default nextConfig;
