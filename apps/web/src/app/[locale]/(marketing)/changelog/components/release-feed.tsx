import {
  CloudOff,
  ExternalLink,
  GitCommit,
  SearchX,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { formatDate } from './changelog-data';
import type {
  ChangeType,
  PlatformRelease,
  ReleaseChange,
  ReleaseSection,
} from './github-releases';
import type { ReleasePage } from './release-query';
import { changeTypeStyles } from './release-styles';

/**
 * The parsed release feed.
 *
 * Each release is one card carrying its package, version and date, then its
 * changes grouped by type. Long sections collapse into a native `<details>`
 * rather than a client-side toggle, so a release with forty commits stays
 * scannable without shipping state for it.
 */

export interface ReleaseFeedLabels {
  changes: string;
  locale: string;
  more: (count: number) => string;
  noResults: string;
  noResultsDescription: string;
  typeLabels: Record<ChangeType, string>;
  unavailable: string;
  unavailableDescription: string;
  viewOnGithub: string;
}

export function ReleaseFeed({
  labels,
  page,
}: {
  labels: ReleaseFeedLabels;
  page: ReleasePage;
}) {
  if (page.results.length === 0) {
    return (
      <FeedNotice
        description={labels.noResultsDescription}
        icon={SearchX}
        title={labels.noResults}
      />
    );
  }

  return (
    <div className="grid gap-3">
      {page.results.map((release) => (
        <ReleaseCard key={release.id} labels={labels} release={release} />
      ))}
    </div>
  );
}

export function ReleaseUnavailable({ labels }: { labels: ReleaseFeedLabels }) {
  return (
    <FeedNotice
      description={labels.unavailableDescription}
      icon={CloudOff}
      title={labels.unavailable}
    />
  );
}

function FeedNotice({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof CloudOff;
  title: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] px-6 py-14 text-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />
      <Icon className="mx-auto h-7 w-7 text-foreground/25" />
      <h3 className="mt-5 font-display font-semibold text-xl tracking-[-0.02em]">
        {title}
      </h3>
      <p className="mx-auto mt-2.5 max-w-md text-balance text-foreground/50 text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

const MAX_INLINE_CHANGES = 5;

function ReleaseCard({
  labels,
  release,
}: {
  labels: ReleaseFeedLabels;
  release: PlatformRelease;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-colors duration-400 hover:border-foreground/[0.16]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-foreground/[0.07] border-b px-5 py-4">
        <span className="inline-flex items-center rounded-full border border-dynamic-purple/25 bg-dynamic-purple/10 px-2.5 py-1 font-mono-ui text-[0.62rem] text-dynamic-purple tracking-[0.08em]">
          {release.packageName}
        </span>
        <span className="font-display font-semibold text-lg tabular-nums tracking-[-0.02em]">
          v{release.version}
        </span>

        <span className="ml-auto flex items-center gap-3">
          <time
            className="font-mono-ui text-[0.6rem] text-foreground/40 uppercase tracking-[0.12em]"
            dateTime={release.publishedAt}
          >
            {formatDate(release.publishedAt, labels.locale)}
          </time>
          <a
            aria-label={`${labels.viewOnGithub} — ${release.tag}`}
            className="text-foreground/30 transition-colors hover:text-foreground"
            href={release.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </span>
      </header>

      {release.sections.length === 0 ? (
        <p className="px-5 py-5 text-foreground/40 text-sm">
          {labels.changes}: 0
        </p>
      ) : (
        <div className="divide-y divide-foreground/[0.05]">
          {release.sections.map((section) => (
            <SectionBlock
              key={section.type}
              labels={labels}
              section={section}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function SectionBlock({
  labels,
  section,
}: {
  labels: ReleaseFeedLabels;
  section: ReleaseSection;
}) {
  const style = changeTypeStyles[section.type];
  const inline = section.changes.slice(0, MAX_INLINE_CHANGES);
  const overflow = section.changes.slice(MAX_INLINE_CHANGES);

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 rounded-full', style.dot)}
        />
        <span
          className={cn(
            'font-mono-ui text-[0.6rem] uppercase tracking-[0.14em]',
            style.text
          )}
        >
          {labels.typeLabels[section.type]}
        </span>
        <span className="font-mono-ui text-[0.6rem] text-foreground/30 tabular-nums">
          {section.changes.length}
        </span>
      </div>

      <ul className="mt-3 grid gap-1.5">
        {inline.map((change) => (
          <ChangeRow change={change} key={changeKey(change)} />
        ))}
      </ul>

      {overflow.length > 0 ? (
        <details className="group/details mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 py-1 font-mono-ui text-[0.6rem] text-foreground/40 uppercase tracking-[0.12em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {labels.more(overflow.length)}
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {overflow.map((change) => (
              <ChangeRow change={change} key={changeKey(change)} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Commit shas repeat across packages in one train, so scope them by text. */
function changeKey(change: ReleaseChange) {
  return `${change.sha ?? 'nosha'}-${change.scope ?? ''}-${change.description}`;
}

function ChangeRow({ change }: { change: ReleaseChange }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {change.scope ? (
        <span className="shrink-0 rounded border border-foreground/[0.08] bg-foreground/[0.03] px-1.5 py-0.5 font-mono-ui text-[0.58rem] text-foreground/45">
          {change.scope}
        </span>
      ) : null}
      <span className="min-w-0 text-foreground/65 leading-relaxed">
        {change.description}
      </span>
      {change.sha && change.url ? (
        <a
          className="inline-flex shrink-0 items-center gap-1 font-mono-ui text-[0.58rem] text-foreground/30 tabular-nums transition-colors hover:text-dynamic-purple"
          href={change.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <GitCommit className="h-3 w-3" />
          {change.sha.slice(0, 7)}
        </a>
      ) : null}
    </li>
  );
}
