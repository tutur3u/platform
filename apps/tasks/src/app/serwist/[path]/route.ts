import { createOfflineRoute } from '@tuturuuu/offline/route';
export const { GET, generateStaticParams } = createOfflineRoute({
  swSrc: 'src/app/sw.ts',
  offlineFallbackUrl: '/offline.html',
  disableInDev: true,
  precacheStaticAssets: false,
  publicPrecachePatterns: [
    'public/android-chrome-*.png',
    'public/apple-touch-icon.png',
    'public/site.webmanifest',
    'public/offline.css',
    'public/offline.js',
  ],
});
