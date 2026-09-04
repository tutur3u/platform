import { BASE_URL, DEV_MODE } from './common';

const APP_URL = DEV_MODE ? BASE_URL : 'https://tasks.tuturuuu.com';

export const siteConfig = {
  icons: {
    apple: `${APP_URL}/apple-touch-icon.png`,
    icon: `${APP_URL}/favicon.ico`,
    shortcut: `${APP_URL}/favicon-16x16.png`,
  },
  manifest: `${APP_URL}/site.webmanifest`,
  name: 'Tuturuuu Tasks',
  url: APP_URL,
  ogImage: DEV_MODE
    ? `${APP_URL}/media/logos/og-image.png`
    : 'https://tasks.tuturuuu.com/media/logos/og-image.png',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
