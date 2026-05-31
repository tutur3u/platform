import { ArrowRight, CheckCircle2 } from '@tuturuuu/icons';
import type {
  ExternalProjectAttentionItem,
  ExternalProjectSummaryCollection,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : null;
}

export function HomeActionCard({
  description,
  href,
  icon,
  primary = false,
  title,
}: {
  description: string;
  href: string;
  icon: ReactNode;
  primary?: boolean;
  title: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group grid min-h-32 grid-cols-[1fr_auto] gap-4 rounded-lg border p-4 transition-colors',
        primary
          ? 'border-foreground/20 bg-foreground text-background hover:bg-foreground/90'
          : 'border-border/70 bg-card/75 hover:border-foreground/25 hover:bg-card'
      )}
    >
      <div className="min-w-0">
        <div className="font-semibold text-base">{title}</div>
        <div
          className={cn(
            'mt-2 text-sm leading-6',
            primary ? 'text-background/75' : 'text-muted-foreground'
          )}
        >
          {description}
        </div>
      </div>
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-md border',
          primary
            ? 'border-background/20 bg-background/10 text-background'
            : 'border-border/70 bg-background/80 text-muted-foreground'
        )}
      >
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
  urlPathLabel,
}: {
  actionHref: string;
  emptyLabel: string;
  icon: ReactNode;
  items: ExternalProjectAttentionItem[];
  title: string;
  urlPathLabel: string;
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
                    {item.collectionTitle} / {urlPathLabel}: {item.slug}
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

export function ContinueEditingPanel({
  description,
  emptyLabel,
  href,
  item,
  title,
  urlPathLabel,
}: {
  description: string;
  emptyLabel: string;
  href: string;
  item: ExternalProjectAttentionItem | null;
  title: string;
  urlPathLabel: string;
}) {
  return (
    <Link
      href={item ? `${href}?entryId=${item.entryId}` : href}
      className="group grid gap-4 rounded-lg border border-border/70 bg-card/75 p-4 transition-colors hover:border-foreground/25 hover:bg-card md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {item ? description : emptyLabel}
        </p>
        {item ? (
          <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2">
            <div className="truncate font-medium text-sm">{item.title}</div>
            <div className="mt-1 truncate text-muted-foreground text-xs">
              {item.collectionTitle} / {urlPathLabel}: {item.slug}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground">
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

export function LaunchChecklist({
  items,
  title,
}: {
  items: Array<{
    complete: boolean;
    href: string;
    label: string;
  }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card/75">
      <div className="border-border/70 border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors',
              item.complete
                ? 'border-foreground/15 bg-foreground text-background'
                : 'border-border/70 bg-background/70 hover:border-foreground/25 hover:bg-background'
            )}
          >
            <CheckCircle2
              className={cn(
                'h-4 w-4 shrink-0',
                item.complete ? 'text-background' : 'text-muted-foreground'
              )}
            />
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CollectionGroup({
  collections,
  emptyLabel,
  hrefForCollection,
  labels,
  totalLabel,
  title,
}: {
  collections: ExternalProjectSummaryCollection[];
  emptyLabel: string;
  hrefForCollection: (collection: ExternalProjectSummaryCollection) => string;
  labels: {
    archived: string;
    draft: string;
    enabled: string;
    published: string;
    scheduled: string;
    unbound: string;
  };
  totalLabel: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/75">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="outline" className="rounded-md tabular-nums">
          {collections.length}
        </Badge>
      </div>
      {collections.length > 0 ? (
        collections.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            href={hrefForCollection(collection)}
            labels={labels}
            totalLabel={totalLabel}
          />
        ))
      ) : (
        <div className="border-border/60 border-t px-4 py-8 text-muted-foreground text-sm">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

export function CollectionRow({
  collection,
  href,
  labels,
  totalLabel,
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
  totalLabel: string;
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
        <div className="mt-1 text-muted-foreground text-xs">
          {collection.totalEntries} {totalLabel}
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
