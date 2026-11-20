import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@bitauth/libauth", "@electrum-cash/network"],
  poweredByHeader: false,
};

export default nextConfig;
