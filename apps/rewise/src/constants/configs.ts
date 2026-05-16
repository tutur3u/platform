import { BASE_URL, DEV_MODE } from './common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://rewise.me';

export const siteConfig = {
  name: 'Rewise',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/media/logos/og-image.png`
    : 'https://rewise.me/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
