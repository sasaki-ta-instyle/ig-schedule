import type { NextConfig } from "next";

const APP_NAME = "ig-schedule";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: isVercel ? "" : `/${APP_NAME}`,
  assetPrefix: isVercel ? undefined : `/${APP_NAME}`,
  trailingSlash: false,
  reactStrictMode: true,
};

export default nextConfig;
