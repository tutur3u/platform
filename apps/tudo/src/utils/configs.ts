const DEV_MODE = process.env.NODE_ENV === 'development';

export const siteConfig = {
  name: 'Tudo',
  url: DEV_MODE ? 'http://localhost:7809' : 'https://tasks.tuturuuu.com',
  ogImage: DEV_MODE
    ? 'http://localhost:7809/api/og'
    : 'https://tasks.tuturuuu.com/api/og',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
