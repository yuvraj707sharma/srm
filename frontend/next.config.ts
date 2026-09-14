import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "/srm",
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  async rewrites() {
    return [
      {
        source: '/srm-api/:path*',
        destination: 'http://127.0.0.1:8007/:path*',
        basePath: false,
      },
      {
        source: '/srm-api/:path*',
        destination: 'http://127.0.0.1:8007/:path*',
      },
    ];
  },
};

export default nextConfig;
