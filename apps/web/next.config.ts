import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Only allow http for localhost/127.0.0.1 in non-production environments
const imageRemotePatterns = [
  // HTTP (localhost/127.0.0.1) patterns for dev only
  ...(process.env.NODE_ENV !== 'production'
    ? [
        { protocol: 'http' as const, hostname: 'localhost' },
        { protocol: 'http' as const, hostname: '127.0.0.1' },
      ]
    : []),
  // Always-allowed HTTPS production patterns
  { protocol: 'https' as const, hostname: '**.supabase.co' },
  { protocol: 'https' as const, hostname: 'avatars.githubusercontent.com' },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
  // cacheComponents: true,
  poweredByHeader: false,
  typescript: {},
  serverExternalPackages: [],
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/ui',
    '@tuturuuu/types',
    '@tuturuuu/utils',
    '@tuturuuu/supabase',
  ],
  images: {
    remotePatterns: imageRemotePatterns,
  },
};

export default withNextIntl(nextConfig);
