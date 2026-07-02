import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const cronMonitoringTraceIncludes = {
  '/api/v1/infrastructure/monitoring/cron': ['./cron.config.json'],
  '/api/v1/infrastructure/monitoring/cron/**': ['./cron.config.json'],
};

const nextConfig = createTuturuuuNextConfig({
  cacheComponents: false,
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
