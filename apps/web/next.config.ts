import type { NextConfig } from "next";

/**
 * Security headers. The product renders PHI, so responses are kept out of
 * shared caches and the app is not embeddable.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  // Workspace package consumed straight from TypeScript source, so there is
  // no separate build step to keep in sync.
  transpilePackages: ["@clinical-copilot/shared-types"],
  async headers() {
    // Note: `Cache-Control` is deliberately not set here. Next.js owns that
    // header per-route and overrides a static config value, which would give
    // false assurance. Authenticated routes get `no-store` from proxy.ts
    // (Phase 2), where the response object is under our control.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
