/** @type {import('next').NextConfig} */
import nextTranslate from 'next-translate-plugin';

const nextConfig = nextTranslate({
  reactStrictMode: true,
  transpilePackages: ['ui'],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // don't resolve 'fs' module on the client to prevent this error on build --> Error: Can't resolve 'fs'
      config.resolve.fallback = {
        fs: false,
      };
    }

    return config;
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
