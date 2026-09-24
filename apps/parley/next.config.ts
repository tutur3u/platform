import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(
  createTuturuuuNextConfig({
    env: { NEXT_PUBLIC_MEETING_APP: 'parley' },
    async rewrites() {
      return {
        beforeFiles: [],
        afterFiles: [],
        fallback: [
          {
            source: '/api/:path*',
            destination: `${resolveTuturuuuWebAppUrl()}/api/:path*`,
          },
        ],
      };
    },
  })
);
