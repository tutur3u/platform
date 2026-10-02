import type { MetadataRoute } from 'next';
import { siteConfig } from '@/constants/configs';

// Leave redirect aliases crawlable so search engines can consolidate canonicals.
const PRIVATE_PATHS = [
  '/api/',
  '/account/delete',
  '/vi/account/delete',
  '/invite/',
  '/vi/invite/',
  '/login',
  '/vi/login',
  '/logout',
  '/vi/logout',
  '/onboarding',
  '/vi/onboarding',
  '/share/',
  '/vi/share/',
  '/users/',
  '/vi/users/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_PATHS,
    },
    sitemap: new URL('/sitemap.xml', siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
