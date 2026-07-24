import type { JSONContent } from '@tiptap/react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MessagesSquare,
} from '@tuturuuu/icons/lucide';
import { createClient } from '@tuturuuu/supabase/next/server';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { ActionLink } from '@/components/marketing/action-link';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';
import {
  CategoryChip,
  CoverArt,
  VersionPlate,
} from '../components/changelog-chrome';
import {
  type CategoryLabels,
  categoryKeys,
  formatDate,
  labelFor,
  styleFor,
} from '../components/changelog-data';
import { ChangelogContentRenderer } from './content-renderer';

/**
 * A single release.
 *
 * Rebuilt onto the marketing kit: this page was the last public route still
 * pulling the shared Radix-backed Badge and Card primitives — both client
 * boundaries — into the changelog's route graph, which the index is explicitly
 * pinned against. Its "Have feedback?" panel was also hardcoded English on a
 * translated page, and its discussion button was a `'use client'` component
 * wrapping a link that has no interactivity at all.
 */

interface ChangelogEntryRecord {
  id: string;
  title: string;
  slug: string;
  content: JSONContent;
  summary: string | null;
  category: string;
  version: string | null;
  cover_image_url: string | null;
  published_at: string;
  created_at: string;
}

interface Props {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const changelog = await getChangelog(slug);

  if (!changelog) {
    return getMarketingMetadata(
      {
        title: 'Changelog Not Found',
        description: 'The requested changelog entry could not be found.',
        indexable: false,
        pathname: `/changelog/${slug}`,
      },
      locale
    );
  }

  const title = `${changelog.title} — Changelog`;
  const description =
    changelog.summary || `Read about ${changelog.title} on Tuturuuu`;
  const metadata = getMarketingMetadata(
    {
      title,
      description,
      image: changelog.cover_image_url || undefined,
      imageAlt: changelog.title,
      keywords: [
        'changelog',
        'updates',
        'tuturuuu',
        changelog.category,
        changelog.version ? `v${changelog.version}` : '',
      ].filter(Boolean),
      pathname: `/changelog/${slug}`,
    },
    locale
  );

  return {
    ...metadata,
    authors: [{ name: 'Tuturuuu Team' }],
    openGraph: {
      ...metadata.openGraph,
      type: 'article',
      publishedTime: changelog.published_at,
      modifiedTime: changelog.created_at,
      authors: ['Tuturuuu Team'],
      tags: [changelog.category, 'changelog', 'update'],
    },
  };
}

export default async function ChangelogEntryPage({ params }: Props) {
  const { slug } = await params;
  const changelog = await getChangelog(slug);

  if (!changelog) {
    notFound();
  }

  const t = await getTranslations('changelog-page');
  const locale = await getLocale();
  const { previous, next } = await getAdjacentChangelogs(
    changelog.published_at
  );

  const categoryLabels: CategoryLabels = Object.fromEntries(
    categoryKeys.map((key) => [key, t(`categories.${key}`)])
  );
  const style = styleFor(changelog.category);

  return (
    <main className="relative w-full overflow-x-hidden">
      <article className="relative px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <HeroAtmosphere />

        <div className="relative mx-auto w-full max-w-3xl">
          <a
            className="group inline-flex items-center gap-2 font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.16em] transition-colors hover:text-foreground"
            href="/changelog"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
            {t('back_to_changelog')}
          </a>

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChip
                category={changelog.category}
                label={labelFor(changelog.category, categoryLabels)}
              />
              {changelog.version ? (
                <VersionPlate version={changelog.version} />
              ) : null}
            </div>

            <h1 className="mt-6 text-balance font-display font-extrabold text-4xl leading-[1.04] tracking-[-0.04em] sm:text-5xl">
              {changelog.title}
            </h1>

            {changelog.summary ? (
              <p className="mt-5 text-balance text-foreground/55 text-lg leading-relaxed">
                {changelog.summary}
              </p>
            ) : null}

            <div className="mt-7 flex items-center gap-2 border-foreground/[0.07] border-t pt-6 font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.14em]">
              <Calendar className="h-3.5 w-3.5" />
              <time dateTime={changelog.published_at}>
                {formatDate(changelog.published_at, locale)}
              </time>
            </div>
          </header>

          {changelog.cover_image_url ? (
            <div className="relative mt-10 overflow-hidden rounded-2xl border border-foreground/10">
              <span
                aria-hidden
                className={cn('block h-0.5 w-full opacity-70', style.dot)}
              />
              <CoverArt
                alt={changelog.title}
                category={changelog.category}
                className="aspect-[16/9]"
                priority
                src={changelog.cover_image_url}
              />
            </div>
          ) : null}

          <div className="prose prose-lg dark:prose-invert mt-10 max-w-none">
            <ChangelogContentRenderer content={changelog.content} />
          </div>

          <nav className="mt-14 grid gap-3 border-foreground/[0.07] border-t pt-8 sm:grid-cols-2">
            {previous ? (
              <AdjacentLink
                direction="previous"
                label={t('previous_release')}
                slug={previous.slug}
                title={previous.title}
              />
            ) : (
              <span />
            )}
            {next ? (
              <AdjacentLink
                direction="next"
                label={t('next_release')}
                slug={next.slug}
                title={next.title}
              />
            ) : null}
          </nav>

          <aside className="relative mt-12 overflow-hidden rounded-2xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent p-7 text-center sm:p-9">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
            />
            <MessagesSquare className="mx-auto h-5 w-5 text-foreground/30" />
            <h2 className="mt-5 font-display font-semibold text-xl tracking-[-0.02em]">
              {t('feedback_title')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-balance text-foreground/50 text-sm leading-relaxed">
              {t('feedback_description')}
            </p>
            <div className="mt-6 flex justify-center">
              <ActionLink
                external
                href="https://github.com/tutur3u/platform/discussions"
                variant="ghost"
              >
                {t('feedback_action')}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ActionLink>
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}

function AdjacentLink({
  direction,
  label,
  slug,
  title,
}: {
  direction: 'previous' | 'next';
  label: string;
  slug: string;
  title: string;
}) {
  const isNext = direction === 'next';

  return (
    <a
      className={cn(
        'group flex flex-col gap-2 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-400 hover:-translate-y-0.5 hover:border-foreground/[0.18] hover:bg-foreground/[0.03]',
        isNext && 'sm:col-start-2 sm:items-end sm:text-right'
      )}
      href={`/changelog/${slug}`}
    >
      <span className="flex items-center gap-2 font-mono-ui text-[0.6rem] text-foreground/40 uppercase tracking-[0.14em]">
        {isNext ? null : (
          <ArrowLeft className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-1" />
        )}
        {label}
        {isNext ? (
          <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
        ) : null}
      </span>
      <span className="line-clamp-2 font-medium transition-colors duration-300 group-hover:text-dynamic-purple">
        {title}
      </span>
    </a>
  );
}

const defaultContent: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
};

async function getChangelog(
  slug: string
): Promise<ChangelogEntryRecord | null> {
  const supabase = await createClient();

  // `maybeSingle` rather than `single`: a slug that does not exist is a 404,
  // not an error, and `single` made every bad URL log a PostgREST failure.
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .maybeSingle();

  if (error) {
    console.error('Error fetching changelog:', error);
    return null;
  }

  if (!data?.published_at || !data.created_at) {
    return null;
  }

  return {
    ...data,
    content: (data.content as JSONContent | null) ?? defaultContent,
    published_at: data.published_at,
    created_at: data.created_at,
  };
}

async function getAdjacentChangelogs(publishedAt: string): Promise<{
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}> {
  const supabase = await createClient();

  // Both ends are legitimately empty at the edges of the list, so these are
  // `maybeSingle` too — `single` treated "this is the newest release" as an
  // error condition.
  const [{ data: prevData }, { data: nextData }] = await Promise.all([
    supabase
      .from('changelog_entries')
      .select('slug, title')
      .eq('is_published', true)
      .not('published_at', 'is', null)
      .lt('published_at', publishedAt)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('changelog_entries')
      .select('slug, title')
      .eq('is_published', true)
      .not('published_at', 'is', null)
      .gt('published_at', publishedAt)
      .order('published_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    previous: prevData || null,
    next: nextData || null,
  };
}
