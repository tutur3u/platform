import { MEETING_APP } from '../runtime';
import { BASE_URL } from './common';

export const siteConfig = {
  name: MEETING_APP === 'parley' ? 'Tuturuuu Parley' : 'Tuturuuu Meet',
  url: BASE_URL,
  ogImage: `${BASE_URL}/media/logos/og-image.png`,
  links: {
    twitter: 'https://twitter.com/tutur3u',
    github: 'https://github.com/tutur3u/platform',
  },
};
