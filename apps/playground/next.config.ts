import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  // Playground is not listed in seo-policy.json: every response stays private.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: PRIVATE_ROBOTS_HEADER }],
      },
    ];
  },
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
          source: '/api/:path*',
          destination: `${WEB_APP_URL}/api/:path*`,
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
