const DEV_MODE = process.env.NODE_ENV === 'development';

export const siteConfig = {
  name: 'Tuturuuu Finance',
  url: DEV_MODE ? 'http://localhost:7808' : 'https://finance.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7808/api/og'
    : 'https://finance.tuturuuu.com/api/og',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
