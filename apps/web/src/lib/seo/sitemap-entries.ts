import type { MetadataRoute } from 'next';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import { getPublicLocalizedPath } from './public-routes';

export function createSitemapEntries(
  pathname: string,
  lastModified?: string
): MetadataRoute.Sitemap {
  const absolute = (locale: 'en' | 'vi') =>
    new URL(
      getPublicLocalizedPath(pathname, locale),
      siteConfig.url
    ).toString();
  const languages = {
    'en-US': absolute('en'),
    'vi-VN': absolute('vi'),
    'x-default': absolute('en'),
  };
  return supportedLocales.map((locale) => ({
    url: absolute(locale),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

export interface PublishedChangelog {
  slug: string;
  published_at: string | null;
  updated_at: string | null;
}

/** Only valid single-segment slugs and already-published content can be indexed. */
export function createChangelogSitemapEntries(
  entries: PublishedChangelog[],
  now = Date.now()
): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const published = Date.parse(entry.published_at ?? '');
    if (
      !Number.isFinite(published) ||
      published > now ||
      !entry.slug ||
      entry.slug !== entry.slug.trim() ||
      /[/\\?#]/u.test(entry.slug) ||
      [...entry.slug].some((character) => character.charCodeAt(0) < 32) ||
      ['.', '..'].includes(entry.slug) ||
      seen.has(entry.slug)
    ) {
      return [];
    }
    seen.add(entry.slug);
    const updated = Date.parse(entry.updated_at ?? '');
    const modified =
      Number.isFinite(updated) && updated <= now
        ? Math.max(published, updated)
        : published;
    return createSitemapEntries(
      `/changelog/${encodeURIComponent(entry.slug)}`,
      new Date(modified).toISOString()
    );
  });
}
