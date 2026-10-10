import type { MetadataRoute } from 'next';
import { siteConfig } from '@/constants/configs';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Crawlers must reach redirects and HTTP/meta noindex directives.
      // Authentication and RLS, rather than robots.txt, protect private data.
    },
    sitemap: new URL('/sitemap.xml', siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
