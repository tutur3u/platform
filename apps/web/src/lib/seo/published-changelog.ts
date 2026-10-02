import { createAnonClient } from '@tuturuuu/supabase/next/server';
import { cacheLife } from 'next/cache';
import type { PublishedChangelog } from './sitemap-entries';

const PAGE_SIZE = 1000;
// Stay below the sitemap protocol's 50,000 URL limit across both locales.
const MAX_ENTRIES = 20000;

export async function getPublishedChangelogEntries(): Promise<
  PublishedChangelog[]
> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  // Anonymous RLS access: the sitemap must never inherit a visitor's privileges.
  const supabase = await createAnonClient();
  const entries: PublishedChangelog[] = [];
  const publishedBefore = new Date().toISOString();

  for (let start = 0; start < MAX_ENTRIES; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('changelog_entries')
      .select('slug, published_at, updated_at')
      .eq('is_published', true)
      .not('published_at', 'is', null)
      .lte('published_at', publishedBefore)
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
      .abortSignal(AbortSignal.timeout(10000));

    // Fail the request instead of caching a successful but incomplete sitemap.
    if (error)
      throw new Error('Unable to read published changelog sitemap entries.');
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return entries;
  }
  throw new Error(
    'Changelog sitemap capacity reached; split into multiple sitemaps.'
  );
}
