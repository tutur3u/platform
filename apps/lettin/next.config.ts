import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const web = resolveTuturuuuWebAppUrl();
export default createNextIntlPlugin()(
  createTuturuuuNextConfig({
    async rewrites() {
      return {
        beforeFiles: [],
        afterFiles: createTuturuuuWebWorkspaceApiRewrites(web),
        fallback: [{ source: '/api/:path*', destination: `${web}/api/:path*` }],
      };
    },
  })
);

if (process.env.NODE_ENV === 'development') {
  void initOpenNextCloudflareForDev();
}
