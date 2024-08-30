import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Rise',
  url: DEV_MODE ? 'http://localhost:7805' : 'https://rewise.me',
  ogImage: DEV_MODE
    ? 'http://localhost:7805/media/logos/og-image.png'
    : 'https://rewise.me/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};

export type SiteConfig = typeof siteConfig;
