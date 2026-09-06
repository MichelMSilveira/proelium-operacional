import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: { root: process.cwd() },
  async rewrites() {
    const apiOrigin = process.env.PROELIUM_API_ORIGIN || 'http://localhost:4173';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
