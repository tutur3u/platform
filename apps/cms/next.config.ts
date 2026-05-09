import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { resolveCmsWebAppUrl } from './src/lib/resolve-web-app-url';

const withNextIntl = createNextIntlPlugin();

const WEB_APP_URL = resolveCmsWebAppUrl();

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
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
      // Fallback rewrites only apply when no local route matches,
      // so cms's local API routes can remain empty.
      // Everything else is proxied to the central web app.
      fallback: [
        {
          source: '/api/:path*',
          destination: `${WEB_APP_URL}/api/:path*`,
        },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
