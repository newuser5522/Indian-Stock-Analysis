import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.BASE_PATH || "",
  allowedDevOrigins: ["*"],
};

export default nextConfig;
