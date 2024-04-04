import { withSentryConfig } from '@sentry/nextjs';
import nextTranslate from 'next-translate-plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = nextTranslate({
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      '@mantine/core',
      '@mantine/dates',
      '@mantine/hooks',
      '@mantine/modals',
      '@mantine/notifications',
      '@mantine/tiptap',

      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-icons',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',

      '@react-three/fiber',
      '@tiptap/react',
      'lodash',
    ],
    // ppr: true,
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
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

const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzerConfig(
  withSentryConfig(
    nextConfig,
    {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      // Suppresses source map uploading logs during build
      silent: true,

      org: 'tuturuuu',
      project: 'web-app',
    },
    {
      // For all available options, see:
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

      // Hides source maps from generated client bundles
      hideSourceMaps: true,

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,
    }
  )
);
