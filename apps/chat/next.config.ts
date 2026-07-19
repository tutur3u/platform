import {
  createTuturuuuNextConfig,
  resolveTuturuuuInfrastructureAppUrl,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const INFRASTRUCTURE_APP_URL = resolveTuturuuuInfrastructureAppUrl();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  transpilePackages: [
    '@tuturuuu/auth',
    '@tuturuuu/internal-api',
    '@tuturuuu/satellite',
    '@tuturuuu/ui',
  ],
  async rewrites() {
    return {
      afterFiles: [],
      beforeFiles: [],
      fallback: [
        {
          destination: `${INFRASTRUCTURE_APP_URL}/api/v1/infrastructure/:path*`,
          source: '/api/v1/infrastructure/:path*',
        },
        {
          destination: `${WEB_APP_URL}/api/v1/:path*`,
          source: '/api/v1/:path*',
        },
        {
          destination: `${WEB_APP_URL}/api/ai/:path*`,
          source: '/api/ai/:path*',
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
