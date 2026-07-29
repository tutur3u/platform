import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const webAppUrl = resolveTuturuuuWebAppUrl();

export default withNextIntl(
  createTuturuuuNextConfig({
    async rewrites() {
      return {
        beforeFiles: [],
        afterFiles: [],
        fallback: [
          {
            source: '/api/:path*',
            destination: `${webAppUrl}/api/:path*`,
          },
        ],
      };
    },
  })
);
