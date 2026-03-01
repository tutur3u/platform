import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RMIT NEO League 2026',
    short_name: 'NEO League',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '2340x2340',
        type: 'image/x-icon',
      },
    ],
    theme_color: '#c4ecff',
    background_color: '#c4ecff',
    display: 'standalone',
  };
}
