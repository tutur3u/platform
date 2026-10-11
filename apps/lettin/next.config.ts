import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import {
  createTuturuuuNextConfig,
  createTuturuuuWebWorkspaceApiRewrites,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const web = resolveTuturuuuWebAppUrl();
const nextConfig = createNextIntlPlugin()(
  createTuturuuuNextConfig({
    seoApp: 'lettin',
    async rewrites() {
      return {
        beforeFiles: [],
        afterFiles: createTuturuuuWebWorkspaceApiRewrites(web),
        fallback: [{ source: '/api/:path*', destination: `${web}/api/:path*` }],
      };
    },
  })
);

// Next may load TypeScript configs through its CommonJS compiler in dev/CI.
// Await local bindings inside the supported async config factory, not at module scope.
export default async function configureLettin() {
  if (process.env.NODE_ENV === 'development') {
    await initOpenNextCloudflareForDev();
  }
  return nextConfig;
}
