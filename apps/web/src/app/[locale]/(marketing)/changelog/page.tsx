import { ArrowRight, Megaphone } from '@tuturuuu/icons/lucide';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { SectionEyebrow } from '@/components/landing/shared/section-shell';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { StatStrip } from '@/components/marketing/stat-strip';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';
import {
  type CategoryLabels,
  type ChangelogEntry,
  categoryKeys,
  groupByMonth,
} from './components/changelog-data';
import {
  type ChangelogCopy,
  ChangelogEmpty,
  LatestRelease,
  ReleaseTimeline,
} from './components/changelog-sections';
import {
  type ChangeType,
  changeTypes,
  getReleaseFeed,
} from './components/github-releases';
import type { ReleaseFeedLabels } from './components/release-feed';
import type { ReleaseFilterLabels } from './components/release-filters';
import {
  packageFacets,
  parseQuery,
  type RawSearchParams,
  type ReleaseSort,
  SORTS,
  typeFacets,
} from './components/release-query';
import { ReleasesSection } from './components/releases-section';

export const generateMetadata = createMarketingMetadata({
  title: 'Product Changelog',
  description:
    'Every Tuturuuu release, filterable by package, change type and version — plus the product updates behind them.',
  pathname: '/changelog',
});

/**
 * The changelog: curated product updates, then the full platform release feed.
 *
 * Two sources, deliberately kept apart rather than merged. The curated entries
 * are authored in the infrastructure CMS and are the human account of what
 * shipped. The release feed is read from GitHub, where Release Please cuts one
 * release per package per train — hundreds of entries that would bury the
 * editorial ones if they shared a list, but which are exactly what you want
 * when the question is "when did that fix land in `tasks`".
 *
 * The GitHub response is cached for an hour and filtered on the server, so a
 * visitor costs no GitHub quota and receives one page of results.
 */
export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations('changelog-page');
  const locale = await getLocale();
  const params = await searchParams;
  const query = parseQuery(params);

  const [entries, feed] = await Promise.all([
    getChangelogs(),
    getReleaseFeed(),
  ]);

  const categoryLabels: CategoryLabels = Object.fromEntries(
    categoryKeys.map((key) => [key, t(`categories.${key}`)])
  );

  const typeLabels = Object.fromEntries(
    changeTypes.map((type) => [type, t(`type_${type}`)])
  ) as Record<ChangeType, string>;

  const copy: ChangelogCopy = {
    categoryLabels,
    locale,
    readMore: t('read_more'),
    update: t('update'),
    updates: t('updates'),
  };

  const [latest, ...earlier] = entries;
  const earlierMonths = groupByMonth(earlier, locale);

  const facets = typeFacets(feed.releases);
  const countFor = (type: ChangeType) =>
    facets.find((facet) => facet.value === type)?.count ?? 0;

  const stats = [
    {
      value: String(feed.releases.length),
      label: t('stat_releases'),
      tone: 'purple' as const,
    },
    {
      value: String(packageFacets(feed.releases).length),
      label: t('stat_packages'),
      tone: 'blue' as const,
    },
    {
      value: String(countFor('features')),
      label: t('stat_features'),
      tone: 'green' as const,
    },
    {
      value: String(countFor('fixes')),
      label: t('stat_fixes'),
      tone: 'orange' as const,
    },
  ];

  const filterLabels: ReleaseFilterLabels = {
    allPackages: t('all_packages'),
    packageLabel: t('package_label'),
    reset: t('reset_filters'),
    searchLabel: t('search_label'),
    searchPlaceholder: t('search_placeholder'),
    sortLabel: t('sort_label'),
    sortOptions: Object.fromEntries(
      SORTS.map((sort) => [sort, t(`sort_${sort}`)])
    ) as Record<ReleaseSort, string>,
    typeLabels,
    typesLabel: t('types_label'),
  };

  const feedLabels: ReleaseFeedLabels = {
    changes: t('changes'),
    locale,
    more: (count: number) => t('more_changes', { count }),
    noResults: t('no_results'),
    noResultsDescription: t('no_results_description'),
    typeLabels,
    unavailable: t('releases_unavailable'),
    unavailableDescription: t('releases_unavailable_description'),
    viewOnGithub: t('view_on_github'),
  };

  return (
    <main className="relative w-full overflow-x-hidden">
      <PageHero
        accent="purple"
        actions={
          <>
            <ActionLink href="#releases">
              {t('browse_releases')}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
            <ActionLink
              external
              href="https://github.com/tutur3u/platform/releases"
              variant="ghost"
            >
              {t('cta_button')}
            </ActionLink>
          </>
        }
        description={t('hero_description')}
        eyebrow={t('badge')}
        eyebrowIcon={Megaphone}
        highlight="Tuturuuu"
        title={t('hero_title')}
      >
        {feed.ok && feed.releases.length > 0 ? (
          <StatStrip stats={stats} />
        ) : null}
      </PageHero>

      {latest ? (
        <LatestRelease
          copy={copy}
          entry={latest}
          eyebrow={t('latest_release')}
        />
      ) : null}

      <ReleaseTimeline
        copy={copy}
        eyebrow={t('earlier_releases')}
        groups={earlierMonths}
      />

      {entries.length === 0 ? (
        <ChangelogEmpty
          description={t('no_updates_description')}
          title={t('no_updates')}
        />
      ) : null}

      <ReleasesSection
        eyebrow={t('releases_eyebrow')}
        feed={feed}
        feedLabels={feedLabels}
        filterLabels={filterLabels}
        paginationLabels={{
          next: t('pagination_next'),
          pageOf: ({ page, total }) => t('pagination_page', { page, total }),
          previous: t('pagination_previous'),
        }}
        query={query}
        resultsLabel={(count: number) => t('results_count', { count })}
        subtitle={t('releases_description')}
        title={t('releases_title')}
        truncatedNote={feed.truncated ? t('truncated_note') : null}
      />

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent px-6 py-14 text-center sm:px-10">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-24 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
          />

          <div className="flex justify-center">
            <SectionEyebrow>{t('badge')}</SectionEyebrow>
          </div>

          <h2 className="mt-6 text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
            {t('cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-foreground/55 leading-relaxed">
            {t('cta_description')}
          </p>

          <div className="mt-8 flex justify-center">
            <ActionLink external href="https://github.com/tutur3u/platform">
              {t('cta_button')}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
          </div>
        </div>
      </section>
    </main>
  );
}

async function getChangelogs(): Promise<ChangelogEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('changelog_entries')
    .select(
      'id, title, slug, summary, category, version, cover_image_url, published_at'
    )
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching changelogs:', error);
    return [];
  }

  return data || [];
}
