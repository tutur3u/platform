import { BASE_URL, DEV_MODE } from './common';

export const PROD_BASE_URL = 'https://forms.tuturuuu.com';

const APP_URL = DEV_MODE ? BASE_URL : PROD_BASE_URL;

export const siteConfig = {
  name: 'Tuturuuu Forms',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/media/logos/og-image.jpg`
    : 'https://tuturuuu.com/media/logos/og-image.jpg',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
