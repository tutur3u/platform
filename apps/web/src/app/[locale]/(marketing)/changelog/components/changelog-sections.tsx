import { ArrowRight, Megaphone } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { SectionEyebrow } from '@/components/landing/shared/section-shell';
import { CategoryChip, CoverArt, VersionPlate } from './changelog-chrome';
import {
  type CategoryLabels,
  type ChangelogEntry,
  formatDate,
  formatShortDate,
  labelFor,
  type MonthGroup,
  styleFor,
} from './changelog-data';

/**
 * The changelog as a release timeline.
 *
 * The page it replaces picked a "featured" entry per month as *the first one
 * that happened to have a cover image*, then gave it a half-page panel — so
 * visual hierarchy was decided by whether somebody uploaded a picture, and a
 * month's most significant release could sit in a small tile beneath a minor
 * one. Here the only promoted entry is the newest release, which is a claim the
 * data actually supports, and everything else runs down a single dated spine so
 * the chronology is the structure rather than something you reconstruct.
 */

export interface ChangelogCopy {
  categoryLabels: CategoryLabels;
  locale: string;
  readMore: string;
  update: string;
  updates: string;
}

export function LatestRelease({
  copy,
  entry,
  eyebrow,
}: {
  copy: ChangelogCopy;
  entry: ChangelogEntry;
  eyebrow: string;
}) {
  const style = styleFor(entry.category);

  return (
    <section className="relative px-4 pb-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <SectionEyebrow index="01">{eyebrow}</SectionEyebrow>

        <a
          className="group mt-6 block overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent transition-all duration-500 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-2xl hover:shadow-foreground/5"
          href={`/changelog/${entry.slug}`}
        >
          {/* Lit top edge, tinted by the release's own category. */}
          <span
            aria-hidden
            className={cn('block h-0.5 w-full opacity-70', style.dot)}
          />

          <div className="grid lg:grid-cols-[1.05fr_1fr]">
            <CoverArt
              alt={entry.title}
              category={entry.category}
              className="aspect-[16/10] lg:aspect-auto lg:min-h-[22rem]"
              priority
              src={entry.cover_image_url}
            />

            <div className="flex flex-col justify-center gap-5 p-7 sm:p-10">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip
                  category={entry.category}
                  label={labelFor(entry.category, copy.categoryLabels)}
                />
                {entry.version ? (
                  <VersionPlate version={entry.version} />
                ) : null}
              </div>

              <h3 className="text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
                {entry.title}
              </h3>

              {entry.summary ? (
                <p className="text-pretty text-foreground/55 leading-relaxed">
                  {entry.summary}
                </p>
              ) : null}

              <div className="mt-2 flex items-center justify-between gap-4 border-foreground/[0.07] border-t pt-5">
                <time
                  className="font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.14em]"
                  dateTime={entry.published_at ?? undefined}
                >
                  {formatDate(entry.published_at, copy.locale)}
                </time>
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-medium text-sm',
                    style.text
                  )}
                >
                  {copy.readMore}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </div>
        </a>
      </div>
    </section>
  );
}

export function ReleaseTimeline({
  copy,
  eyebrow,
  groups,
}: {
  copy: ChangelogCopy;
  eyebrow: string;
  groups: MonthGroup[];
}) {
  if (groups.length === 0) return null;

  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <SectionEyebrow index="02">{eyebrow}</SectionEyebrow>

        <div className="mt-10 space-y-14">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-4">
                <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
                  {group.label}
                </h3>
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-foreground/12 to-transparent"
                />
                <span className="shrink-0 font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.14em]">
                  {group.entries.length}{' '}
                  {group.entries.length === 1 ? copy.update : copy.updates}
                </span>
              </div>

              <div className="mt-6">
                {group.entries.map((entry) => (
                  <TimelineRow copy={copy} entry={entry} key={entry.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * One release on the spine.
 *
 * The spine is drawn per row rather than once per group, so it can never
 * overshoot the last entry — rows sit flush and the segments join.
 */
function TimelineRow({
  copy,
  entry,
}: {
  copy: ChangelogCopy;
  entry: ChangelogEntry;
}) {
  const style = styleFor(entry.category);

  return (
    <article className="grid sm:grid-cols-[5.5rem_1.75rem_minmax(0,1fr)]">
      <time
        className="hidden pt-6 text-right font-mono-ui text-[0.62rem] text-foreground/40 uppercase tabular-nums tracking-[0.12em] sm:block"
        dateTime={entry.published_at ?? undefined}
      >
        {formatShortDate(entry.published_at, copy.locale)}
      </time>

      <div aria-hidden className="relative hidden sm:block">
        <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-foreground/[0.09]" />
        <span
          className={cn(
            'absolute top-[1.6rem] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full ring-4 ring-background',
            style.dot
          )}
        />
      </div>

      <div className="pb-3">
        <a
          className="group relative block overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-400 hover:-translate-y-0.5 hover:border-foreground/[0.18] hover:bg-foreground/[0.03] sm:p-6"
          href={`/changelog/${entry.slug}`}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
              style.glow
            )}
          />

          <div className="relative flex flex-wrap items-center gap-2">
            <CategoryChip
              category={entry.category}
              label={labelFor(entry.category, copy.categoryLabels)}
            />
            {entry.version ? <VersionPlate version={entry.version} /> : null}
            <time
              className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.12em] sm:hidden"
              dateTime={entry.published_at ?? undefined}
            >
              {formatDate(entry.published_at, copy.locale)}
            </time>
          </div>

          <h4
            className={cn(
              'relative mt-4 text-balance font-display font-semibold text-lg tracking-[-0.01em] transition-colors duration-300',
              style.hoverText
            )}
          >
            {entry.title}
          </h4>

          {entry.summary ? (
            <p className="relative mt-2 line-clamp-2 text-foreground/50 text-sm leading-relaxed">
              {entry.summary}
            </p>
          ) : null}

          <span
            className={cn(
              'relative mt-4 inline-flex items-center gap-1.5 font-mono-ui text-[0.62rem] uppercase tracking-[0.14em] opacity-0 transition-opacity duration-300 group-hover:opacity-100',
              style.text
            )}
          >
            {copy.readMore}
            <ArrowRight className="h-3 w-3" />
          </span>
        </a>
      </div>
    </article>
  );
}

export function ChangelogEmpty({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent px-6 py-16 text-center">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />
        <Megaphone className="mx-auto h-8 w-8 text-foreground/25" />
        <h2 className="mt-6 font-display font-semibold text-2xl tracking-[-0.02em]">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-balance text-foreground/50 leading-relaxed">
          {description}
        </p>
      </div>
    </section>
  );
}
