import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Tuturuuu Tasks',
  url: DEV_MODE ? 'http://localhost:7809' : 'https://tasks.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7809/media/logos/og-image.png'
    : 'https://tasks.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
