import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Tumeet',
  url: DEV_MODE ? 'http://localhost:7807' : 'https://tumeet.me',
  ogImage: DEV_MODE
    ? 'http://localhost:7807/media/logos/og-image.png'
    : 'https://tumeet.me/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
