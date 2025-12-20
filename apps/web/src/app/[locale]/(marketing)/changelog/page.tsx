import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Megaphone,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Changelog | Tuturuuu',
  description:
    'Stay up to date with the latest features, improvements, and updates to the Tuturuuu platform.',
};

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  version: string | null;
  cover_image_url: string | null;
  published_at: string | null;
}

const categoryConfig: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    colorClass: string;
  }
> = {
  feature: {
    label: 'New Feature',
    icon: <Sparkles className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  },
  improvement: {
    label: 'Improvement',
    icon: <TrendingUp className="h-4 w-4" />,
    colorClass: 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/20',
  },
  bugfix: {
    label: 'Bug Fix',
    icon: <Bug className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  },
  breaking: {
    label: 'Breaking Change',
    icon: <AlertTriangle className="h-4 w-4" />,
    colorClass: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
  },
  security: {
    label: 'Security',
    icon: <Shield className="h-4 w-4" />,
    colorClass:
      'bg-dynamic-purple/10 text-dynamic-purple border-dynamic-purple/20',
  },
  performance: {
    label: 'Performance',
    icon: <Zap className="h-4 w-4" />,
    colorClass: 'bg-dynamic-cyan/10 text-dynamic-cyan border-dynamic-cyan/20',
  },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupByMonth(
  entries: ChangelogEntry[]
): Record<string, ChangelogEntry[]> {
  return entries.reduce(
    (groups, entry) => {
      if (!entry.published_at) return groups;
      const date = new Date(entry.published_at);
      const monthYear = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });

      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(entry);
      return groups;
    },
    {} as Record<string, ChangelogEntry[]>
  );
}

export default async function ChangelogPage() {
  const t = await getTranslations('changelog-page');
  const changelogs = await getChangelogs();
  const groupedChangelogs = groupByMonth(changelogs);
  const months = Object.keys(groupedChangelogs);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160" />
        <div className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/20 via-dynamic-cyan/10 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <Badge
            variant="secondary"
            className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
          >
            <Megaphone className="mr-1.5 h-3.5 w-3.5" />
            {t('badge')}
          </Badge>

          <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {t('hero_title')}{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              Tuturuuu
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-balance text-foreground/70 text-lg">
            {t('hero_description')}
          </p>
        </div>
      </section>

      {/* Changelog List */}
      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {months.length === 0 ? (
            <Card className="p-12 text-center">
              <Megaphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 font-semibold text-xl">{t('no_updates')}</h2>
              <p className="text-muted-foreground">
                {t('no_updates_description')}
              </p>
            </Card>
          ) : (
            <div className="space-y-16">
              {months.map((month) => {
                const entries = groupedChangelogs[month] || [];
                // Featured entry is the first one with a cover image, or just the first one
                const featuredEntry =
                  entries.find((e) => e.cover_image_url) || entries[0];
                const otherEntries = entries.filter(
                  (e) => e.id !== featuredEntry?.id
                );

                return (
                  <div key={month}>
                    <div className="mb-8 flex items-center gap-4">
                      <h2 className="font-bold text-2xl">{month}</h2>
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground text-sm">
                        {entries.length}{' '}
                        {entries.length === 1 ? t('update') : t('updates')}
                      </span>
                    </div>

                    {/* Featured Entry */}
                    {featuredEntry && (
                      <Link
                        href={`/changelog/${featuredEntry.slug}`}
                        className="group mb-6 block"
                      >
                        <Card className="overflow-hidden transition-all hover:border-dynamic-purple/30 hover:shadow-xl">
                          <div className="grid gap-0 md:grid-cols-2">
                            {/* Cover Image */}
                            <div className="relative aspect-video bg-muted">
                              {featuredEntry.cover_image_url ? (
                                <Image
                                  src={featuredEntry.cover_image_url}
                                  alt={featuredEntry.title}
                                  fill
                                  className="object-cover transition-transform duration-300"
                                  unoptimized
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-dynamic-blue/20">
                                  <Megaphone className="h-16 w-16 text-muted-foreground/50" />
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex flex-col justify-center p-6 md:p-8">
                              <div className="mb-3 flex flex-wrap items-center gap-2">
                                {(() => {
                                  const config = categoryConfig[
                                    featuredEntry.category
                                  ] || {
                                    label: featuredEntry.category,
                                    icon: null,
                                    colorClass:
                                      'bg-muted text-muted-foreground',
                                  };
                                  return (
                                    <Badge
                                      variant="outline"
                                      className={`gap-1.5 ${config.colorClass}`}
                                    >
                                      {config.icon}
                                      {config.label}
                                    </Badge>
                                  );
                                })()}
                                {featuredEntry.version && (
                                  <Badge
                                    variant="secondary"
                                    className="font-mono"
                                  >
                                    {featuredEntry.version}
                                  </Badge>
                                )}
                              </div>

                              <h3 className="mb-3 font-bold text-2xl transition-colors group-hover:text-dynamic-purple">
                                {featuredEntry.title}
                              </h3>

                              {featuredEntry.summary && (
                                <p className="mb-4 line-clamp-3 text-foreground/70">
                                  {featuredEntry.summary}
                                </p>
                              )}

                              <div className="mt-auto flex items-center justify-between">
                                <span className="text-muted-foreground text-sm">
                                  {formatDate(featuredEntry.published_at)}
                                </span>
                                <span className="flex items-center font-medium text-dynamic-purple text-sm">
                                  {t('read_more')}
                                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    )}

                    {/* Other Entries Grid */}
                    {otherEntries.length > 0 && (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {otherEntries.map((entry) => {
                          const config = categoryConfig[entry.category] || {
                            label: entry.category,
                            icon: null,
                            colorClass: 'bg-muted text-muted-foreground',
                          };

                          return (
                            <Link
                              key={entry.id}
                              href={`/changelog/${entry.slug}`}
                              className="group block"
                            >
                              <Card className="flex h-full flex-col overflow-hidden transition-all hover:border-dynamic-purple/30 hover:shadow-lg">
                                {/* Cover Image */}
                                {entry.cover_image_url && (
                                  <div className="relative aspect-video bg-muted">
                                    <Image
                                      src={entry.cover_image_url}
                                      alt={entry.title}
                                      fill
                                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                                      unoptimized
                                    />
                                  </div>
                                )}

                                {/* Content */}
                                <div className="flex flex-1 flex-col p-5">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`gap-1 text-xs ${config.colorClass}`}
                                    >
                                      {config.icon}
                                      {config.label}
                                    </Badge>
                                    {entry.version && (
                                      <Badge
                                        variant="secondary"
                                        className="font-mono text-xs"
                                      >
                                        {entry.version}
                                      </Badge>
                                    )}
                                  </div>

                                  <h3 className="mb-2 line-clamp-2 font-semibold text-lg transition-colors group-hover:text-dynamic-purple">
                                    {entry.title}
                                  </h3>

                                  {entry.summary && (
                                    <p className="mb-3 line-clamp-2 text-foreground/70 text-sm">
                                      {entry.summary}
                                    </p>
                                  )}

                                  <div className="mt-auto flex items-center justify-between pt-2">
                                    <span className="text-muted-foreground text-xs">
                                      {formatDate(entry.published_at)}
                                    </span>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-dynamic-purple" />
                                  </div>
                                </div>
                              </Card>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Subscribe CTA */}
      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 text-center sm:p-12">
            <h2 className="mb-4 font-bold text-2xl sm:text-3xl">
              {t('cta_title')}
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-foreground/70">
              {t('cta_description')}
            </p>
            <Button asChild>
              <a
                href="https://github.com/tutur3u/platform"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('cta_button')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </Card>
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
