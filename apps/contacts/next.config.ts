import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';
import { CONTACTS_LOCAL_RESERVED_API_PATHS } from './src/lib/central-api-paths';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  seoApp: 'contacts',
  async rewrites() {
    return {
      // Contacts owns feedback routes with satellite app-session auth. A
      // beforeFiles rewrite would intercept the local route before Next sees it.
      beforeFiles: createTuturuuuWebWorkspaceApiRewrites(WEB_APP_URL).filter(
        ({ source }) => !CONTACTS_LOCAL_RESERVED_API_PATHS.has(source)
      ),
      afterFiles: [],
      // Fallback rewrites only apply when no local route matches,
      // so pay's own payment/billing API routes still win locally.
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
