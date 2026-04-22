import { DEV_MODE } from './common';

export const siteConfig = {
  name: 'Tuturuuu CMS',
  url: DEV_MODE ? 'http://localhost:7811' : 'https://cms.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7811/media/logos/og-image.png'
    : 'https://cms.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
