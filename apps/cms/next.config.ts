import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
const IS_DEPLOYED_ENVIRONMENT =
  process.env.VERCEL === '1' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

const WEB_APP_URL = trimTrailingSlashes(
  process.env.INTERNAL_WEB_API_ORIGIN ||
    process.env.NEXT_PUBLIC_WEB_APP_URL ||
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (IS_DEPLOYED_ENVIRONMENT
      ? 'https://tuturuuu.com'
      : `http://localhost:${CENTRAL_PORT}`)
);

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
