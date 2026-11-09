import { getOfflineTurbopackConfig } from '@tuturuuu/offline/config';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  seoApp: 'workspace',
  ...getOfflineTurbopackConfig(),
  transpilePackages: ['@tuturuuu/ui'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'tuturuuu.com' }],
  },
  async rewrites() {
    return {
      beforeFiles: [...createTuturuuuWebWorkspaceApiRewrites(WEB_APP_URL)],
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches. Every API
      // route stays on the central web app.
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
