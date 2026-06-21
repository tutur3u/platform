import { ArrowLeft, ArrowRight, Calendar } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { Locale } from '../../lib/platform/locale';
import { withLocalePrefix } from '../../lib/platform/locale';
import { ChangelogContentRenderer } from './changelog-content-renderer';
import { getChangelogCopy } from './changelog-copy';
import {
  defaultContent,
  formatChangelogDate,
  getChangelogCategoryConfig,
} from './changelog-utils';
import type { ChangelogAdjacentEntry, ChangelogEntry } from './types';

type ChangelogEntryPageProps = {
  changelog: ChangelogEntry;
  locale: Locale;
  next: ChangelogAdjacentEntry | null;
  previous: ChangelogAdjacentEntry | null;
};

export function ChangelogEntryPage({
  changelog,
  locale,
  next,
  previous,
}: ChangelogEntryPageProps) {
  const copy = getChangelogCopy(locale);
  const config = getChangelogCategoryConfig(changelog.category);
  const content = changelog.content ?? defaultContent;

  return (
    <main className="relative mx-auto w-full overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160" />
        <div className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/20 via-dynamic-cyan/10 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140" />
      </div>

      <article className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <a
            className="mb-8 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
            href={withLocalePrefix('/changelog', locale)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {copy.backToChangelog}
          </a>

          <header className="mb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge
                className={`gap-1.5 ${config.colorClass}`}
                variant="outline"
              >
                {config.icon}
                {config.label}
              </Badge>
              {changelog.version ? (
                <Badge className="font-mono" variant="secondary">
                  {changelog.version}
                </Badge>
              ) : null}
            </div>

            <h1 className="mb-4 text-balance font-bold text-3xl tracking-tight sm:text-4xl md:text-5xl">
              {changelog.title}
            </h1>

            {changelog.published_at ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <time dateTime={changelog.published_at}>
                  {formatChangelogDate(changelog.published_at)}
                </time>
              </div>
            ) : null}
          </header>

          {changelog.cover_image_url ? (
            <div className="mb-8 overflow-hidden rounded-lg">
              <img
                alt={changelog.title}
                className="h-auto w-full object-cover"
                height={600}
                src={changelog.cover_image_url}
                width={1200}
              />
            </div>
          ) : null}

          <div className="prose prose-lg dark:prose-invert max-w-none">
            <ChangelogContentRenderer content={content} />
          </div>

          <ChangelogEntryNavigation
            copy={copy}
            locale={locale}
            next={next}
            previous={previous}
          />

          <div className="mt-12">
            <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-6 text-center">
              <h2 className="mb-2 font-semibold text-lg">
                {copy.feedbackTitle}
              </h2>
              <p className="mb-4 text-muted-foreground">
                {copy.feedbackDescription}
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://github.com/tutur3u/platform/discussions"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {copy.feedbackButton}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </Card>
          </div>
        </div>
      </article>
    </main>
  );
}

function ChangelogEntryNavigation({
  copy,
  locale,
  next,
  previous,
}: {
  copy: ReturnType<typeof getChangelogCopy>;
  locale: Locale;
  next: ChangelogAdjacentEntry | null;
  previous: ChangelogAdjacentEntry | null;
}) {
  return (
    <nav className="mt-12 border-t pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        {previous ? (
          <AdjacentLink
            copy={copy}
            direction="previous"
            entry={previous}
            locale={locale}
          />
        ) : (
          <div />
        )}
        {next ? (
          <AdjacentLink
            copy={copy}
            direction="next"
            entry={next}
            locale={locale}
          />
        ) : (
          <div />
        )}
      </div>
    </nav>
  );
}

function AdjacentLink({
  copy,
  direction,
  entry,
  locale,
}: {
  copy: ReturnType<typeof getChangelogCopy>;
  direction: 'next' | 'previous';
  entry: ChangelogAdjacentEntry;
  locale: Locale;
}) {
  const isNext = direction === 'next';

  return (
    <a
      className={isNext ? 'group text-right' : 'group'}
      href={withLocalePrefix(`/changelog/${entry.slug}`, locale)}
    >
      <Card className="p-4 transition-all hover:border-dynamic-purple/30 hover:shadow-md">
        <div
          className={`flex items-center gap-2 text-muted-foreground text-sm ${
            isNext ? 'justify-end' : ''
          }`}
        >
          {isNext ? null : (
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          )}
          {isNext ? copy.next : copy.previous}
          {isNext ? (
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          ) : null}
        </div>
        <div className="mt-1 font-medium group-hover:text-dynamic-purple">
          {entry.title}
        </div>
      </Card>
    </a>
  );
}
