import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `npm run dev:lan`: phones load the dev server via the laptop's private Wi-Fi IP. Next 16 blocks
  // cross-origin requests to dev resources (HMR etc.) unless the host is listed. Dev-only setting.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
