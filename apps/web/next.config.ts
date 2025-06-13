import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@ncthub/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'https',
        hostname: 'yjbjpmwbfimjcdsjxfst.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'nzamlzqfdwaaxdefwraj.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },

  async headers() {
    return [
      {
        // Setting CORS headers for all routes
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          // Use wildcard in development, which is more permissive
          {
            key: 'Access-Control-Allow-Origin',
            value: isDev ? '*' : 'https://rmitnct.club',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
      {
        // Setting CORS headers specifically for the login path
        source: '/login/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          // Use wildcard in development, which is more permissive
          {
            key: 'Access-Control-Allow-Origin',
            value: isDev ? '*' : 'https://rmitnct.club',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
      {
        // Setting CORS headers for API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          // Use wildcard in development, which is more permissive
          {
            key: 'Access-Control-Allow-Origin',
            value: isDev ? '*' : 'https://rmitnct.club',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, rsc, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
