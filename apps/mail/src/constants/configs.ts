import { BASE_URL, DEV_MODE } from './common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://mail.tuturuuu.com';

export const siteConfig = {
  name: 'Tuturuuu Mail',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/media/logos/og-image.png`
    : 'https://mail.tuturuuu.com/media/logos/og-image.png',
  links: {
    github: 'https://github.com/tutur3u/platform',
    twitter: 'https://twitter.com/tutur3u',
  },
};
