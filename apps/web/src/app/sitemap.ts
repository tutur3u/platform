import type { MetadataRoute } from 'next';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import {
  getPublicLocalizedPath,
  PUBLIC_SEO_ROUTES,
} from '@/lib/seo/public-routes';

function getAbsoluteUrl(pathname: string) {
  return new URL(pathname, siteConfig.url).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SEO_ROUTES.flatMap((route) => {
    const englishUrl = getAbsoluteUrl(
      getPublicLocalizedPath(route.pathname, 'en')
    );
    const vietnameseUrl = getAbsoluteUrl(
      getPublicLocalizedPath(route.pathname, 'vi')
    );
    const languages = {
      'en-US': englishUrl,
      'vi-VN': vietnameseUrl,
      'x-default': englishUrl,
    };

    return supportedLocales.map((locale) => ({
      url: getAbsoluteUrl(getPublicLocalizedPath(route.pathname, locale)),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: { languages },
    }));
  });
}
