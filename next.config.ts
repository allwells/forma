import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep build-time type validation in process with the TypeScript 5 API.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
