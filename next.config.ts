import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: { cpus: 2 },
};
export default config;
