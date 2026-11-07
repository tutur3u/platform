import { BASE_URL, DEV_MODE, REWISE_PRODUCTION_URL } from './common';

const APP_URL = DEV_MODE ? BASE_URL : REWISE_PRODUCTION_URL;

export const siteConfig = {
  name: 'Rewise',
  url: APP_URL,
  ogImage: `${APP_URL}/media/logos/og-image.png`,
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
