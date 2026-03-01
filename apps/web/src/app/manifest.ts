import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NCT Hub',
    short_name: 'NCT Hub',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '320x284',
        type: 'image/x-icon',
      },
    ],
    theme_color: '#171624',
    background_color: '#171624',
    display: 'standalone',
  };
}
