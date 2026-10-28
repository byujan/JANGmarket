import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is a package-lock.json in the parent directory, outside this repo,
  // which makes the workspace root ambiguous. Pin it to this project.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
