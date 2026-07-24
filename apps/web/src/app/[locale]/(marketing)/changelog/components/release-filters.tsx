'use client';

import { Search, SlidersHorizontal, X } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ChangeType } from './github-releases';
import {
  buildSearch,
  type Facet,
  type ReleaseQuery,
  type ReleaseSort,
  SORTS,
} from './release-query';
import { changeTypeStyles } from './release-styles';

/**
 * The filter bar.
 *
 * Every control writes to the URL rather than to component state, so a
 * narrowed view is a link: filters survive reload, back/forward behave, and
 * the server only ever sends the page you asked for. Typing is debounced and
 * wrapped in a transition, so the results dim rather than blanking while the
 * next page streams in.
 *
 * The controls are native elements on purpose — this route is pinned away from
 * the shared Radix primitives, and a `<select>` is the one control that is
 * already correct on a phone.
 */

export interface ReleaseFilterLabels {
  allPackages: string;
  packageLabel: string;
  reset: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortLabel: string;
  sortOptions: Record<ReleaseSort, string>;
  typeLabels: Record<ChangeType, string>;
  typesLabel: string;
}

const selectClasses =
  'h-10 w-full min-w-0 appearance-none rounded-xl border border-foreground/[0.09] bg-foreground/[0.02] px-3 pr-8 font-mono-ui text-[0.7rem] text-foreground/70 uppercase tracking-[0.1em] transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ReleaseFilters({
  labels,
  packages,
  query,
  types,
}: {
  labels: ReleaseFilterLabels;
  packages: Facet[];
  query: ReleaseQuery;
  types: Facet[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.q);

  // The live query is read through a ref so the debounce effect depends only
  // on what actually changed, not on a fresh object every render.
  const queryRef = useRef(query);
  queryRef.current = query;

  const apply = (next: Partial<ReleaseQuery>) => {
    const merged = { ...queryRef.current, page: 1, ...next };
    startTransition(() => {
      router.replace(`${pathname}${buildSearch(merged)}`, { scroll: false });
    });
  };

  // Keep the field in step when the URL changes from somewhere else — the
  // reset button, or a back navigation.
  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);

  useEffect(() => {
    if (search === queryRef.current.q) return;

    const timer = setTimeout(() => {
      const merged = { ...queryRef.current, page: 1, q: search };
      startTransition(() => {
        router.replace(`${pathname}${buildSearch(merged)}`, { scroll: false });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [search, pathname, router]);

  const filtered = Boolean(query.q || query.packageName || query.type);

  return (
    <div
      aria-busy={pending}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4 transition-opacity duration-300 sm:p-5',
        pending && 'opacity-60'
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/40 to-transparent"
      />

      <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <label className="relative block">
          <span className="sr-only">{labels.searchLabel}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground/35" />
          <input
            className="h-10 w-full rounded-xl border border-foreground/[0.09] bg-foreground/[0.02] pr-9 pl-9 text-sm transition-colors placeholder:text-foreground/35 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            type="search"
            value={search}
          />
          {search ? (
            <button
              aria-label={labels.reset}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-foreground/35 transition-colors hover:text-foreground"
              onClick={() => setSearch('')}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        <SelectShell>
          <select
            aria-label={labels.packageLabel}
            className={selectClasses}
            onChange={(event) => apply({ packageName: event.target.value })}
            value={query.packageName}
          >
            <option value="">{labels.allPackages}</option>
            {packages.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>
        </SelectShell>

        <SelectShell>
          <select
            aria-label={labels.sortLabel}
            className={selectClasses}
            onChange={(event) =>
              apply({ sort: event.target.value as ReleaseSort })
            }
            value={query.sort}
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {labels.sortOptions[sort]}
              </option>
            ))}
          </select>
        </SelectShell>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2 border-foreground/[0.07] border-t pt-4">
        <span className="mr-1 font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.16em]">
          {labels.typesLabel}
        </span>

        {types.map((facet) => {
          const type = facet.value as ChangeType;
          const active = query.type === type;

          return (
            <button
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-ui text-[0.6rem] uppercase tracking-[0.12em] transition-all duration-300',
                changeTypeStyles[type].chip,
                active
                  ? 'ring-2 ring-current/30'
                  : 'opacity-70 hover:opacity-100'
              )}
              key={type}
              onClick={() => apply({ type: active ? '' : type })}
              type="button"
            >
              {labels.typeLabels[type]}
              <span className="tabular-nums opacity-60">{facet.count}</span>
            </button>
          );
        })}

        {filtered ? (
          <button
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.09] px-3 py-1 font-mono-ui text-[0.6rem] text-foreground/50 uppercase tracking-[0.12em] transition-colors hover:border-foreground/25 hover:text-foreground"
            onClick={() => {
              setSearch('');
              apply({ packageName: '', q: '', type: '' });
            }}
            type="button"
          >
            <X className="h-3 w-3" />
            {labels.reset}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Wraps a native select so it can carry a custom chevron. */
function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <SlidersHorizontal className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-foreground/35" />
    </div>
  );
}
