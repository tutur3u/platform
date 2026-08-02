import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();
const cronMonitoringTraceIncludes = {
  '/api/v1/infrastructure/monitoring/cron': ['./cron.config.json'],
  '/api/v1/infrastructure/monitoring/cron/**': ['./cron.config.json'],
};

const nextConfig = createTuturuuuNextConfig({
  async rewrites() {
    return {
      afterFiles: [],
      beforeFiles: [
        {
          destination: `${WEB_APP_URL}/api/v1/workspaces`,
          source: '/api/v1/workspaces',
        },
      ],
      fallback: [
        {
          destination: `${WEB_APP_URL}/api/:path*`,
          source: '/api/:path*',
        },
      ],
    };
  },
  outputFileTracingIncludes: cronMonitoringTraceIncludes,
  partialPrefetching: false,
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/auth',
    '@tuturuuu/email-service',
    '@tuturuuu/icons',
    '@tuturuuu/internal-api',
    '@tuturuuu/payment',
    '@tuturuuu/realtime',
    '@tuturuuu/satellite',
    '@tuturuuu/supabase',
    '@tuturuuu/transactional',
    '@tuturuuu/turnstile',
    '@tuturuuu/types',
    '@tuturuuu/ui',
    '@tuturuuu/utils',
    '@tuturuuu/vercel',
  ],
  images: {
    remotePatterns: [
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
});

export default withNextIntl(nextConfig);
