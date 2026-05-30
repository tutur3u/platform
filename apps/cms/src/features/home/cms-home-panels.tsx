import type {
  ExternalProjectAttentionItem,
  ExternalProjectSummaryCollection,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : null;
}

export function StatTile({
  action,
  icon,
  href,
  title,
  value,
}: {
  action: string;
  icon: ReactNode;
  href: string;
  title: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="group grid min-h-32 grid-cols-[1fr_auto] gap-4 rounded-lg border border-border/70 bg-card/75 p-4 transition-colors hover:border-foreground/25 hover:bg-card"
    >
      <div className="min-w-0">
        <div className="text-muted-foreground text-sm">{title}</div>
        <div className="mt-3 font-semibold text-3xl tabular-nums">{value}</div>
        <div className="mt-3 text-muted-foreground text-xs transition-colors group-hover:text-foreground">
          {action}
        </div>
      </div>
      <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
        {icon}
      </div>
    </Link>
  );
}

export function QueuePanel({
  actionHref,
  emptyLabel,
  icon,
  items,
  title,
}: {
  actionHref: string;
  emptyLabel: string;
  icon: ReactNode;
  items: ExternalProjectAttentionItem[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card/75">
      <div className="flex items-center justify-between gap-3 border-border/70 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="truncate font-medium text-sm">{title}</h2>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-md tabular-nums">
          {items.length}
        </Badge>
      </div>
      <div className="divide-y divide-border/60">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : (
          items.slice(0, 4).map((item) => (
            <Link
              key={`${item.kind}-${item.entryId}`}
              href={`${actionHref}?entryId=${item.entryId}`}
              className="block px-4 py-3 transition-colors hover:bg-background/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">
                    {item.title}
                  </div>
                  <div className="mt-1 truncate text-muted-foreground text-xs">
                    {item.collectionTitle} / {item.slug}
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 rounded-md">
                  {item.status}
                </Badge>
              </div>
              <div className="mt-2 line-clamp-2 text-muted-foreground text-xs leading-5">
                {item.detail}
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export function CollectionRow({
  collection,
  href,
  labels,
}: {
  collection: ExternalProjectSummaryCollection;
  href: string;
  labels: {
    archived: string;
    draft: string;
    enabled: string;
    published: string;
    scheduled: string;
    unbound: string;
  };
}) {
  return (
    <Link
      href={href}
      className="grid gap-3 border-border/60 border-t px-4 py-3 transition-colors hover:bg-background/70 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate font-medium text-sm">{collection.title}</div>
          <Badge
            variant={collection.isEnabled ? 'secondary' : 'outline'}
            className="rounded-md"
          >
            {collection.isEnabled ? labels.enabled : labels.unbound}
          </Badge>
        </div>
        <div className="mt-1 truncate text-muted-foreground text-xs">
          {collection.slug}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-right text-xs tabular-nums">
        <div>
          <div className="font-medium">{collection.draftEntries}</div>
          <div className="text-muted-foreground">{labels.draft}</div>
        </div>
        <div>
          <div className="font-medium">{collection.scheduledEntries}</div>
          <div className="text-muted-foreground">{labels.scheduled}</div>
        </div>
        <div>
          <div className="font-medium">{collection.publishedEntries}</div>
          <div className="text-muted-foreground">{labels.published}</div>
        </div>
        <div>
          <div className="font-medium">{collection.archivedEntries}</div>
          <div className="text-muted-foreground">{labels.archived}</div>
        </div>
      </div>
    </Link>
  );
}
