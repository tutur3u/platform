'use client';

import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useId, useState } from 'react';
import {
  SHOWCASE_CATEGORY_LABELS,
  type ShowcaseCategory,
  type ShowcaseProduct,
} from '@/lib/showcase/catalog';
import {
  type CatalogFilter,
  DEFAULT_CATALOG_FILTER,
  filterCatalog,
  isDefaultFilter,
} from '@/lib/showcase/filter';
import { SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import { SearchIcon } from './icons';
import { ProductCard } from './product-card';
import { focusRing } from './styles';

const CATEGORY_OPTIONS = [
  'all',
  ...(Object.keys(SHOWCASE_CATEGORY_LABELS) as ShowcaseCategory[]),
] as const;

const chip = cn(
  'inline-flex h-8 items-center rounded-full border px-3 font-medium text-sm transition-colors',
  focusRing
);

export function ProductExplorer({
  products,
}: {
  products: readonly ShowcaseProduct[];
}) {
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_CATALOG_FILTER);
  const searchId = useId();
  const interactiveId = useId();
  const results = filterCatalog(products, filter);
  const update = (patch: Partial<CatalogFilter>) =>
    setFilter((current) => ({ ...current, ...patch }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full space-y-1.5 lg:max-w-sm">
          <label className="font-medium text-sm" htmlFor={searchId}>
            Search products
          </label>
          <div className="relative">
            <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground" />
            <Input
              autoComplete="off"
              className="pl-9"
              id={searchId}
              maxLength={SHOWCASE_LIMITS.titleLength}
              onChange={(event) => update({ query: event.target.value })}
              placeholder="Tasks, invoices, flashcards..."
              type="search"
              value={filter.query}
            />
          </div>
        </div>

        <label
          className="flex items-center gap-2 font-medium text-sm"
          htmlFor={interactiveId}
        >
          <input
            checked={filter.interactiveOnly}
            className={cn('size-4 accent-primary', focusRing)}
            id={interactiveId}
            onChange={(event) =>
              update({ interactiveOnly: event.target.checked })
            }
            type="checkbox"
          />
          Interactive only
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Category</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((category) => {
            const selected = filter.category === category;
            return (
              <button
                key={category}
                aria-pressed={selected}
                className={cn(
                  chip,
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                onClick={() => update({ category })}
                type="button"
              >
                {category === 'all'
                  ? 'All'
                  : SHOWCASE_CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p aria-live="polite" className="text-muted-foreground text-sm">
        {results.length === 1 ? '1 product' : `${results.length} products`}
      </p>

      {results.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border border-dashed p-6">
          <p className="font-medium">No products match these filters.</p>
          <button
            className={cn(
              'inline-flex h-8 items-center rounded-md border border-input bg-background px-3 font-medium text-sm hover:bg-accent hover:text-accent-foreground',
              focusRing
            )}
            disabled={isDefaultFilter(filter)}
            onClick={() => setFilter(DEFAULT_CATALOG_FILTER)}
            type="button"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
