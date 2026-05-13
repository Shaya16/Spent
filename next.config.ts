import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Block embedding in iframes from other origins.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser from MIME-sniffing responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the originating URL on outbound links.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down browser capabilities this app never needs.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // CSP for a local-only app: only same-origin scripts/styles + Google
  // fonts + the favicon API. Inline styles allowed for shadcn/Tailwind.
  // 'unsafe-inline' on scripts is necessary because Next dev injects them.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://www.google.com",
      "connect-src 'self' https://api.anthropic.com http://localhost:11434 ws://127.0.0.1:* ws://localhost:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "israeli-bank-scrapers"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
