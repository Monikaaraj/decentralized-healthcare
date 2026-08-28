import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/decentralized-healthcare',
  assetPrefix: '/decentralized-healthcare/',
  images: { unoptimized: true }
};

export default nextConfig;
