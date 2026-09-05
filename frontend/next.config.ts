import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: { root: process.cwd() },
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://localhost:4173/api/:path*' }];
  },
};

export default nextConfig;
