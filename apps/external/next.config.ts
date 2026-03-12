import type { NextConfig } from 'next';

const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
const WEB_APP_URL =
  process.env.INTERNAL_WEB_API_ORIGIN ||
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  process.env.WEB_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`);

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'tuturuuu.com',
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/:path*',
          destination: `${WEB_APP_URL}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
