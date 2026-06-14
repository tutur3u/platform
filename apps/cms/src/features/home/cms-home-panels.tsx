import { ArrowRight } from '@tuturuuu/icons';
import type { ExternalProjectAttentionItem } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
