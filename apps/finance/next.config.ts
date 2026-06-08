import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  transpilePackages: [
    '@tuturuuu/ai',
    '@tuturuuu/apis',
    '@tuturuuu/auth',
    '@tuturuuu/icons',
    '@tuturuuu/internal-api',
    '@tuturuuu/offline',
    '@tuturuuu/satellite',
    '@tuturuuu/supabase',
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
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches,
      // so finance's existing API routes still work.
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
