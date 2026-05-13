import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "israeli-bank-scrapers"],
  devIndicators: false,
};

export default nextConfig;
