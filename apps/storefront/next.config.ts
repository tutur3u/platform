import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import {
  createTuturuuuNextConfig,
  isTuturuuuNextDeployedEnvironment,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();
const INVENTORY_APP_URL = resolveInternalAppUrl({
  appName: 'inventory',
  candidates: [
    process.env.INVENTORY_APP_URL,
    process.env.NEXT_PUBLIC_INVENTORY_APP_URL,
  ],
  fallback: isTuturuuuNextDeployedEnvironment()
    ? 'https://inventory.tuturuuu.com'
    : getLocalInternalAppUrl('inventory', 'http://localhost:7815'),
});

const nextConfig = createTuturuuuNextConfig({
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
          source: '/api/v1/inventory/:path*',
          destination: `${INVENTORY_APP_URL}/api/v1/inventory/:path*`,
        },
        {
          source: '/api/:path*',
          destination: `${WEB_APP_URL}/api/:path*`,
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
