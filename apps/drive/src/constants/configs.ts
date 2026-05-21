import { BASE_URL, DEV_MODE } from './common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://drive.tuturuuu.com';

export const siteConfig = {
  name: 'Tuturuuu Drive',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/media/logos/og-image.png`
    : 'https://drive.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
