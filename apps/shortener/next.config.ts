import type { NextConfig } from 'next';

const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
const IS_DEPLOYED_ENVIRONMENT =
  process.env.VERCEL === '1' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NODE_ENV === 'production';
const WEB_APP_URL =
  process.env.INTERNAL_WEB_API_ORIGIN ||
  process.env.NEXT_PUBLIC_WEB_APP_URL ||
  process.env.WEB_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (IS_DEPLOYED_ENVIRONMENT
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
