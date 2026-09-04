import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  images: {
    unoptimized: true,
  },
  // Keep jsdom on Node's module loader. Bundling isomorphic-dompurify into the
  // server graph makes webpack copy jsdom's browser stylesheet into `.next`
  // and can exhaust the dev server heap while compiling mailbox routes.
  serverExternalPackages: ['isomorphic-dompurify'],
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
