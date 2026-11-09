import { BASE_URL, DEV_MODE, PROD_BASE_URL } from './common';

const APP_URL = DEV_MODE ? BASE_URL : PROD_BASE_URL;

export const siteConfig = {
  name: 'Tuturuuu',
  url: APP_URL,
  ogImage: 'https://tuturuuu.com/media/logos/og-image.jpg',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
