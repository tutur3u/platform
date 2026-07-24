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
  summarise,
} from './components/changelog-data';
import {
  type ChangelogCopy,
  ChangelogEmpty,
  LatestRelease,
  ReleaseTimeline,
} from './components/changelog-sections';

export const generateMetadata = createMarketingMetadata({
  title: 'Product Changelog',
  description:
    'Stay up to date with the latest features, improvements, and updates to the Tuturuuu platform.',
  pathname: '/changelog',
});

/**
 * The changelog index, rebuilt as a release timeline on the marketing kit.
 *
 * What changed beyond the surface: the page used to promote, per month, the
 * first entry that happened to carry a cover image — so hierarchy tracked
 * whether someone uploaded a picture rather than what shipped. Now exactly one
 * entry is promoted (the newest, which is a fact) and the rest run down a dated
 * spine. The category table it shared with the entry page is one module, and
 * both the category names and the summary labels come from the message bundle
 * instead of being hardcoded English inside a translated page.
 */
export default async function ChangelogPage() {
  const t = await getTranslations('changelog-page');
  const locale = await getLocale();
  const entries = await getChangelogs();

  const categoryLabels: CategoryLabels = Object.fromEntries(
    categoryKeys.map((key) => [key, t(`categories.${key}`)])
  );

  const copy: ChangelogCopy = {
    categoryLabels,
    locale,
    readMore: t('read_more'),
    update: t('update'),
    updates: t('updates'),
  };

  const [latest, ...earlier] = entries;
  const allMonths = groupByMonth(entries, locale);
  const earlierMonths = groupByMonth(earlier, locale);

  const stats = summarise(entries, allMonths.length, {
    releases: t('stat_releases'),
    months: t('stat_months'),
    types: t('stat_types'),
    version: t('stat_version'),
  });

  return (
    <main className="relative w-full overflow-x-hidden">
      <PageHero
        accent="purple"
        actions={
          <ActionLink
            external
            href="https://github.com/tutur3u/platform"
            variant="ghost"
          >
            {t('cta_button')}
            <ArrowRight className="h-4 w-4" />
          </ActionLink>
        }
        description={t('hero_description')}
        eyebrow={t('badge')}
        eyebrowIcon={Megaphone}
        highlight="Tuturuuu"
        title={t('hero_title')}
      >
        {entries.length > 0 ? <StatStrip stats={stats} /> : null}
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
