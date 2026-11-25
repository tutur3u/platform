import { BASE_URL, DEV_MODE } from '@/constants/common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://whiteboards.tuturuuu.com';

export const siteConfig = {
  name: 'Tuturuuu Whiteboards',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/api/og`
    : 'https://whiteboards.tuturuuu.com/api/og',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
