import { BASE_URL, DEV_MODE } from '@/constants/common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://finance.tuturuuu.com';

export const siteConfig = {
  name: 'Tuturuuu Finance',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/api/og`
    : 'https://finance.tuturuuu.com/api/og',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
