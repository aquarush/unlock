import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@bitauth/libauth", "@electrum-cash/network"],
  poweredByHeader: false,
  // Self-hosting (VPS): STANDALONE=1 npm run build produces a minimal .next/standalone server.
  output: process.env.STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
