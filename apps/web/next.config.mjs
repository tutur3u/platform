import nextTranslate from 'next-translate-plugin';

/** @type {import('next').NextConfig} */
const nextConfig = nextTranslate({
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    ppr: true,
    // reactCompiler: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
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

  async headers() {
    return [
      {
        // matching all API routes
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,DELETE,PATCH,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ];
  },
});

// Next.js App Directory doesn't need the i18n config
nextConfig.i18n = undefined;
export default nextConfig;
