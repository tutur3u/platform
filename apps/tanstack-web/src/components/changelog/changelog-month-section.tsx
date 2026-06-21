import type { Locale } from '../../lib/platform/locale';
import {
  ChangelogEntryCard,
  FeaturedChangelogCard,
} from './changelog-entry-card';
import type { ChangelogCopy, ChangelogEntry } from './types';

type ChangelogMonthSectionProps = {
  copy: ChangelogCopy;
  entries: ChangelogEntry[];
  locale: Locale;
  month: string;
};

export function ChangelogMonthSection({
  copy,
  entries,
  locale,
  month,
}: ChangelogMonthSectionProps) {
  const featuredEntry =
    entries.find((entry) => entry.cover_image_url) ?? entries[0];
  const otherEntries = entries.filter(
    (entry) => entry.id !== featuredEntry?.id
  );

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <h2 className="font-bold text-2xl">{month}</h2>
        <div className="h-px flex-1 bg-border" />
        <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground text-sm">
          {entries.length} {entries.length === 1 ? copy.update : copy.updates}
        </span>
      </div>

      {featuredEntry ? (
        <FeaturedChangelogCard
          copy={copy}
          entry={featuredEntry}
          locale={locale}
        />
      ) : null}

      {otherEntries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {otherEntries.map((entry) => (
            <ChangelogEntryCard entry={entry} key={entry.id} locale={locale} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
