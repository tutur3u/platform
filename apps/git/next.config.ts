import {
  createTuturuuuNextConfig,
  resolveTuturuuuWebAppUrl,
} from '@tuturuuu/utils/next-config';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const WEB_APP_URL = resolveTuturuuuWebAppUrl();

const nextConfig = createTuturuuuNextConfig({
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'user-images.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'private-user-images.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'img.shields.io',
      },
    ],
  },
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
