import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Tuturuuu Finance',
  url: DEV_MODE ? 'http://localhost:7808' : 'https://finance.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7808/media/logos/og-image.png'
    : 'https://finance.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
