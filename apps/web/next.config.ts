import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Links such as "Weiterlesen" must not tell manga sites where the click came from.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker image (own server): a self-contained server bundle. Local runs (`pnpm start`) stay unchanged.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const, outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)) }
    : {}),
  transpilePackages: ["@rwt/core", "@rwt/db", "@rwt/server"],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // JSON only: nothing in an API response may ever be rendered as a page.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
