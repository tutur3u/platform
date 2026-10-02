import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { PUBLIC_SEO_ROUTES } from '@/lib/seo/public-routes';
import { getPublishedChangelogEntries } from '@/lib/seo/published-changelog';
import {
  createChangelogSitemapEntries,
  createSitemapEntries,
} from '@/lib/seo/sitemap-entries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Prevent the complete XML from being frozen at build time. Content refreshes
  // hourly through the cached anonymous reader without requiring a redeploy.
  await connection();
  const changelogs = await getPublishedChangelogEntries();
  return [
    ...PUBLIC_SEO_ROUTES.flatMap((route) =>
      createSitemapEntries(route.pathname)
    ),
    ...createChangelogSitemapEntries(changelogs),
  ];
}
