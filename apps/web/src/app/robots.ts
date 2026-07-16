import type { MetadataRoute } from 'next';
import { siteConfig } from '@/constants/configs';

const PRIVATE_OR_TRANSITIONAL_PATHS = [
  '/api/',
  '/account/delete',
  '/vi/account/delete',
  '/calendar/meet-together',
  '/vi/calendar/meet-together',
  '/calendar/meet-together/',
  '/vi/calendar/meet-together/',
  '/invite/',
  '/vi/invite/',
  '/login',
  '/vi/login',
  '/logout',
  '/vi/logout',
  '/onboarding',
  '/vi/onboarding',
  '/pricing',
  '/vi/pricing',
  '/products/meet-together',
  '/vi/products/meet-together',
  '/qr-generator',
  '/vi/qr-generator',
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
      disallow: PRIVATE_OR_TRANSITIONAL_PATHS,
    },
    sitemap: new URL('/sitemap.xml', siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
