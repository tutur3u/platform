import { ArrowRight, Megaphone } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { Locale } from '../../lib/platform/locale';
import { getChangelogCopy } from './changelog-copy';
import { ChangelogMonthSection } from './changelog-month-section';
import { groupChangelogsByMonth } from './changelog-utils';
import type { ChangelogEntry } from './types';

type ChangelogPageProps = {
  changelogs: ChangelogEntry[];
  locale: Locale;
};

export function ChangelogPage({ changelogs, locale }: ChangelogPageProps) {
  const copy = getChangelogCopy(locale);
  const groupedChangelogs = groupChangelogsByMonth(changelogs);
  const months = Object.keys(groupedChangelogs);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160" />
        <div className="absolute top-[30%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/20 via-dynamic-cyan/10 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140" />
      </div>

      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-4xl text-center">
          <Badge
            className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
            variant="secondary"
          >
            <Megaphone className="mr-1.5 h-3.5 w-3.5" />
            {copy.badge}
          </Badge>

          <h1 className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {copy.heroTitle}{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              Tuturuuu
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-balance text-foreground/70 text-lg">
            {copy.heroDescription}
          </p>
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {months.length === 0 ? (
            <Card className="p-12 text-center">
              <Megaphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 font-semibold text-xl">{copy.noUpdates}</h2>
              <p className="text-muted-foreground">
                {copy.noUpdatesDescription}
              </p>
            </Card>
          ) : (
            <div className="space-y-16">
              {months.map((month) => (
                <ChangelogMonthSection
                  copy={copy}
                  entries={groupedChangelogs[month] ?? []}
                  key={month}
                  locale={locale}
                  month={month}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 text-center sm:p-12">
            <h2 className="mb-4 font-bold text-2xl sm:text-3xl">
              {copy.ctaTitle}
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-foreground/70">
              {copy.ctaDescription}
            </p>
            <Button asChild>
              <a
                href="https://github.com/tutur3u/platform"
                rel="noopener noreferrer"
                target="_blank"
              >
                {copy.ctaButton}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </Card>
        </div>
      </section>
    </main>
  );
}
