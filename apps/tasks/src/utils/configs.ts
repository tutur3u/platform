const DEV_MODE = process.env.NODE_ENV === 'development';

export const siteConfig = {
  name: 'Tuturuuu Meet',
  url: DEV_MODE ? 'http://localhost:7807' : 'https://tumeet.me',
  ogImage: DEV_MODE
    ? 'http://localhost:7803/api/og'
    : 'https://tumeet.me/api/og',
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
