import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
  // cacheComponents: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@react-email/render', '@react-email/components'],
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/ui',
    '@tuturuuu/types',
    '@tuturuuu/utils',
    '@tuturuuu/supabase',
    'jsdom',
    'parse5',
  ],
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
    ],
  },
};

export default withNextIntl(nextConfig);
