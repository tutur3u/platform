import { createSerwistRoute } from '@tuturuuu/offline/route';

export const { GET, dynamic, dynamicParams, revalidate, generateStaticParams } =
  createSerwistRoute({
    // Service worker source file
    swSrc: 'src/app/sw.ts',
    // Offline fallback page to precache
    offlineFallbackUrl: '/~offline',
    // Enable service worker in development for testing (default: disabled)
    disableInDev: true,
  });
