import { createManifest } from '@tuturuuu/offline/manifest';

export default function manifest() {
  return createManifest({
    name: 'Tuturuuu',
    shortName: 'Tuturuuu',
    description:
      'Your digital ally for seamless productivity and collaborative success.',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-512x512.png', sizes: '512x512', purpose: 'any' },
    ],
    categories: ['productivity', 'utilities', 'business'],
    screenshots: [
      {
        src: '/screenshots/desktop.jpg',
        sizes: '2944x1724',
        type: 'image/jpeg',
        form_factor: 'wide',
        label: 'Tuturuuu Dashboard - Desktop View',
      },
      {
        src: '/screenshots/mobile.jpg',
        sizes: '800x1724',
        type: 'image/jpeg',
        form_factor: 'narrow',
        label: 'Tuturuuu Dashboard - Mobile View',
      },
    ],
  });
}
