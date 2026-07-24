'use client';

import { ArrowLeft, ArrowRight } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { buildSearch, type ReleaseQuery } from './release-query';

/**
 * Feed pagination.
 *
 * Rendered as real anchors with real hrefs — a crawler and a middle-click both
 * get a working URL — but clicks are handled by the router so paging feels the
 * same as filtering rather than reloading the document.
 */
export function ReleasePagination({
  labels,
  page,
  pageCount,
  query,
}: {
  labels: { next: string; pageOf: string; previous: string };
  page: number;
  pageCount: number;
  query: ReleaseQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  if (pageCount <= 1) return null;

  const hrefFor = (target: number) =>
    `${pathname}${buildSearch({ ...query, page: target })}`;

  const go = (event: React.MouseEvent, target: number) => {
    event.preventDefault();
    startTransition(() => {
      router.push(hrefFor(target), { scroll: false });
    });
  };

  return (
    <nav
      aria-busy={pending}
      className={cn(
        'mt-8 flex items-center justify-between gap-4 border-foreground/[0.07] border-t pt-6 transition-opacity duration-300',
        pending && 'opacity-60'
      )}
    >
      <PageLink
        disabled={page <= 1}
        href={hrefFor(page - 1)}
        onClick={(event) => go(event, page - 1)}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {labels.previous}
      </PageLink>

      <span className="font-mono-ui text-[0.62rem] text-foreground/40 uppercase tabular-nums tracking-[0.14em]">
        {labels.pageOf}
      </span>

      <PageLink
        disabled={page >= pageCount}
        href={hrefFor(page + 1)}
        onClick={(event) => go(event, page + 1)}
      >
        {labels.next}
        <ArrowRight className="h-3.5 w-3.5" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  children,
  disabled,
  href,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.06] px-4 py-2 font-mono-ui text-[0.62rem] text-foreground/20 uppercase tracking-[0.14em]">
        {children}
      </span>
    );
  }

  return (
    <a
      className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.09] px-4 py-2 font-mono-ui text-[0.62rem] text-foreground/60 uppercase tracking-[0.14em] transition-colors hover:border-foreground/25 hover:text-foreground"
      href={href}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
