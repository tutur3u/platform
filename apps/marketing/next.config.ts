import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';
import publicSeoRoutes from './src/lib/seo/public-routes.generated.json';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  seoApp: 'marketing',
  // Same indexable surface as the web app: the generated public routes and
  // the changelog articles served through the gateway.
  seoPublicPathPatterns: [
    ...publicSeoRoutes.map((pathname) =>
      pathname.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ),
    'changelog/[^/]+',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tuturuuu.com',
      },
    ],
  },
  // Anything the marketing app does not own is served by the web app.
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
