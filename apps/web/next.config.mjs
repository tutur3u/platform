/** @type {import('next').NextConfig} */
import nextTranslate from 'next-translate-plugin';

const nextConfig = nextTranslate({
  reactStrictMode: true,
  transpilePackages: ['ui'],

  experimental: {
    appDir: false,
  },

  rewrites() {
    return [
      {
        source: '/settings',
        destination: '/settings/account',
      },
    ];
  },
});

export default nextConfig;
