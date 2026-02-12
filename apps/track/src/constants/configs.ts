import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Tuturuuu Track',
  url: DEV_MODE ? 'http://localhost:7810' : 'https://track.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7810/media/logos/og-image.png'
    : 'https://track.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
