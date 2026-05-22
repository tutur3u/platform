import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import {
  getTuturuuuPortlessAppOrigin,
  TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS,
} from '@tuturuuu/utils/portless';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
const IS_DEPLOYED_ENVIRONMENT =
  process.env.VERCEL === '1' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

const WEB_APP_URL = trimTrailingSlashes(
  process.env.INTERNAL_WEB_API_ORIGIN ||
    process.env.NEXT_PUBLIC_WEB_APP_URL ||
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (IS_DEPLOYED_ENVIRONMENT
      ? 'https://tuturuuu.com'
      : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`))
);

const hiveDockerBuild = process.env.HIVE_DOCKER_BUILD === '1';
const HIVE_REALTIME_HTTP_URL =
  process.env.HIVE_REALTIME_HTTP_URL ||
  getTuturuuuPortlessAppOrigin('hive-realtime');

const nextConfig: NextConfig = {
  allowedDevOrigins: [...TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS],
  reactCompiler: true,
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
  typescript: {
    ignoreBuildErrors: true,
  },
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
};

export default withNextIntl(nextConfig);
