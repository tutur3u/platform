import { getOfflineTurbopackConfig } from '@tuturuuu/offline/config';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

import {
  createCalendarApiRewrites,
  resolveCalendarAppUrl,
} from './src/lib/calendar-api-rewrites';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  seoApp: 'tasks',
  ...getOfflineTurbopackConfig(),
  transpilePackages: ['@tuturuuu/ui'],
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
      beforeFiles: [
        ...createCalendarApiRewrites(resolveCalendarAppUrl()),
        ...createTuturuuuWebWorkspaceApiRewrites(WEB_APP_URL),
      ],
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches,
      // so Tasks' existing API routes (task-boards, members, auth) still work.
      // Everything else is proxied to the central web app.
      fallback: [
        {
          source: '/api/:path*',
          destination: `${WEB_APP_URL}/api/:path*`,
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
