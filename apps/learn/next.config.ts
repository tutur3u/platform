import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl({
  localFallbackUrl: 'https://tuturuuu.localhost',
});

const nextConfig = createTuturuuuNextConfig({
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/v1/:path*',
          destination: `${WEB_APP_URL}/api/v1/:path*`,
        },
        {
          source: '/api/ai/:path*',
          destination: `${WEB_APP_URL}/api/ai/:path*`,
        },
      ],
    };
  },
});

export default withNextIntl(nextConfig);
