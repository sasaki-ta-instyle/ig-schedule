import type { NextConfig } from "next";

const APP_NAME = "ig-schedule";

const isVercel = process.env.VERCEL === "1";
const basePath = isVercel ? "" : `/${APP_NAME}`;

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
