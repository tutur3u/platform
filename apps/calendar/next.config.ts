import { getOfflineTurbopackConfig } from '@tuturuuu/offline/config';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

import {
  CALENDAR_BASE_PATH,
  createLegacyRootRedirectHeaders,
  createLegacyRootRedirects,
} from './src/lib/legacy-root-routes';
import { createTaskApiRewrites } from './src/lib/task-api-rewrites';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const TASKS_APP_URL = resolveInternalAppUrl({
  appName: 'tasks',
  candidates: [
    process.env.TASKS_APP_URL,
    process.env.NEXT_PUBLIC_TASKS_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://tasks.tuturuuu.com'
      : getLocalInternalAppUrl('tasks', 'http://localhost:7809'),
});

const nextConfig = createTuturuuuNextConfig({
  seoApp: 'calendar',
  basePath: CALENDAR_BASE_PATH,
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
  async headers() {
    return createLegacyRootRedirectHeaders();
  },
  // Unprefixed legacy paths (`/`, `/personal`) have no route under the base
  // path; see src/lib/legacy-root-routes.ts.
  async redirects() {
    return createLegacyRootRedirects();
  },
  async rewrites() {
    return {
      beforeFiles: [
        ...createTaskApiRewrites(TASKS_APP_URL),
        ...createTuturuuuWebWorkspaceApiRewrites(WEB_APP_URL),
      ],
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches,
      // so calendar's existing API routes (auth) still work.
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
