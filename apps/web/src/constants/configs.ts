import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Genius Junior',
  url: DEV_MODE ? 'http://localhost:7803' : 'https://geniusjunior.vercel.app',
  ogImage: DEV_MODE
    ? 'http://localhost:7803/media/logos/og-image.jpg'
    : 'https://geniusjunior.vercel.app/media/logos/og-image.jpg',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};

export type SiteConfig = typeof siteConfig;
