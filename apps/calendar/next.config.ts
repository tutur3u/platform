import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@tuturuuu/ui'],
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
    ],
  },
};

export default withNextIntl(nextConfig);
