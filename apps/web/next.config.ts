import { getTurbopackConfig } from '@tuturuuu/offline/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const serwistConfig = getTurbopackConfig();
const isDockerStandaloneBuild = process.env.DOCKER_WEB_STANDALONE === '1';

const nextConfig: NextConfig = {
  ...serwistConfig,
  ...(isDockerStandaloneBuild ? { output: 'standalone' } : {}),
  reactCompiler: true,
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [...(serwistConfig.serverExternalPackages ?? [])],
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/ui',
    '@tuturuuu/types',
    '@tuturuuu/utils',
    '@tuturuuu/supabase',
    '@tuturuuu/microsoft',
    '@tuturuuu/google',
    '@tuturuuu/offline',
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
      {
        protocol: 'https',
        hostname: 'tuturuuu.com',
      },
      {
        protocol: 'https',
        hostname: 'models.dev',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
