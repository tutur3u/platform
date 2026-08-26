import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  // `/embed/<shareCode>` is the only route in this app meant to be framed by a
  // third-party site. Listing it here removes the platform-wide
  // `frame-ancestors 'none'` / `X-Frame-Options: DENY` headers for that path
  // and nothing else.
  framablePathPatterns: ['embed/[^/]+'],
  async rewrites() {
    return {
      beforeFiles: createTuturuuuWebWorkspaceApiRewrites(WEB_APP_URL),
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches,
      // so forms' own workspace/shared form API routes still win locally.
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
