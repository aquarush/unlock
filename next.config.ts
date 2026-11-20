import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@bitauth/libauth", "@electrum-cash/network"],
  poweredByHeader: false,
  // Self-hosting (VPS): STANDALONE=1 npm run build produces a minimal .next/standalone server.
  output: process.env.STANDALONE ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
