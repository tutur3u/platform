import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

import { createCalendarApiRewrites } from './src/lib/calendar-api-rewrites';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const CALENDAR_APP_URL = resolveInternalAppUrl({
  appName: 'calendar',
  candidates: [
    process.env.CALENDAR_APP_URL,
    process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://calendar.tuturuuu.com'
      : getLocalInternalAppUrl('calendar', 'http://localhost:7806'),
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
      beforeFiles: [
        ...createCalendarApiRewrites(CALENDAR_APP_URL),
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
