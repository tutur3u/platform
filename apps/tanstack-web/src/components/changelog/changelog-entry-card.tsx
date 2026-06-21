import { ArrowRight, Megaphone } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import type { Locale } from '../../lib/platform/locale';
import { withLocalePrefix } from '../../lib/platform/locale';
import {
  formatChangelogDate,
  getChangelogCategoryConfig,
} from './changelog-utils';
import type { ChangelogCopy, ChangelogEntry } from './types';

type FeaturedChangelogCardProps = {
  copy: ChangelogCopy;
  entry: ChangelogEntry;
  locale: Locale;
};

type ChangelogEntryCardProps = {
  entry: ChangelogEntry;
  locale: Locale;
};

export function FeaturedChangelogCard({
  copy,
  entry,
  locale,
}: FeaturedChangelogCardProps) {
  const config = getChangelogCategoryConfig(entry.category);

  return (
    <a
      className="group mb-6 block"
      href={withLocalePrefix(`/changelog/${entry.slug}`, locale)}
    >
      <Card className="overflow-hidden transition-all hover:border-dynamic-purple/30 hover:shadow-xl">
        <div className="grid gap-0 md:grid-cols-2">
          <ChangelogCoverImage entry={entry} fallbackSize="large" />

          <div className="flex flex-col justify-center p-6 md:p-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                className={`gap-1.5 ${config.colorClass}`}
                variant="outline"
              >
                {config.icon}
                {config.label}
              </Badge>
              {entry.version ? (
                <Badge className="font-mono" variant="secondary">
                  {entry.version}
                </Badge>
              ) : null}
            </div>

            <h3 className="mb-3 font-bold text-2xl transition-colors group-hover:text-dynamic-purple">
              {entry.title}
            </h3>

            {entry.summary ? (
              <p className="mb-4 line-clamp-3 text-foreground/70">
                {entry.summary}
              </p>
            ) : null}

            <div className="mt-auto flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {formatChangelogDate(entry.published_at)}
              </span>
              <span className="flex items-center font-medium text-dynamic-purple text-sm">
                {copy.readMore}
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}

export function ChangelogEntryCard({ entry, locale }: ChangelogEntryCardProps) {
  const config = getChangelogCategoryConfig(entry.category);

  return (
    <a
      className="group block"
      href={withLocalePrefix(`/changelog/${entry.slug}`, locale)}
    >
      <Card className="flex h-full flex-col overflow-hidden transition-all hover:border-dynamic-purple/30 hover:shadow-lg">
        {entry.cover_image_url ? <ChangelogCoverImage entry={entry} /> : null}

        <div className="flex flex-1 flex-col p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              className={`gap-1 text-xs ${config.colorClass}`}
              variant="outline"
            >
              {config.icon}
              {config.label}
            </Badge>
            {entry.version ? (
              <Badge className="font-mono text-xs" variant="secondary">
                {entry.version}
              </Badge>
            ) : null}
          </div>

          <h3 className="mb-2 line-clamp-2 font-semibold text-lg transition-colors group-hover:text-dynamic-purple">
            {entry.title}
          </h3>

          {entry.summary ? (
            <p className="mb-3 line-clamp-2 text-foreground/70 text-sm">
              {entry.summary}
            </p>
          ) : null}

          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-muted-foreground text-xs">
              {formatChangelogDate(entry.published_at)}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-dynamic-purple" />
          </div>
        </div>
      </Card>
    </a>
  );
}

function ChangelogCoverImage({
  entry,
  fallbackSize,
}: {
  entry: ChangelogEntry;
  fallbackSize?: 'large';
}) {
  return (
    <div className="relative aspect-video bg-muted">
      {entry.cover_image_url ? (
        <img
          alt={entry.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          src={entry.cover_image_url}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-dynamic-purple/20 via-dynamic-pink/10 to-dynamic-blue/20">
          <Megaphone
            className={
              fallbackSize === 'large'
                ? 'h-16 w-16 text-muted-foreground/50'
                : 'h-12 w-12 text-muted-foreground/50'
            }
          />
        </div>
      )}
    </div>
  );
}
