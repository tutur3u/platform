import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const hiveDockerBuild = process.env.HIVE_DOCKER_BUILD === '1';
const HIVE_REALTIME_HTTP_URL =
  process.env.HIVE_REALTIME_HTTP_URL ||
  getTuturuuuPortlessAppOrigin('hive-realtime');

const nextConfig = createTuturuuuNextConfig({
  ...(hiveDockerBuild ? { output: 'standalone' } : {}),
  ...(hiveDockerBuild
    ? {
        experimental: {
          staticGenerationMaxConcurrency: 4,
          staticGenerationMinPagesPerWorker: 8,
          staticGenerationRetryCount: 2,
        },
      }
    : {}),
  transpilePackages: [
    '@tuturuuu/hive-ui',
    '@tuturuuu/internal-api',
    '@tuturuuu/realtime',
  ],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/realtime/:path*',
          destination: `${HIVE_REALTIME_HTTP_URL}/realtime/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [
        {
          source: '/api/v1/:path*',
          destination: `${WEB_APP_URL}/api/v1/:path*`,
        },
        {
          source: '/api/ai/:path*',
          destination: `${WEB_APP_URL}/api/ai/:path*`,
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
