'use client';

import { Search, X } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { LaunchableAppCategory } from '@tuturuuu/utils/launchable-apps';
import { useMemo, useState } from 'react';
import { AppCatalogCard } from './apps-catalog-card';
import { CATEGORY_TONES } from './apps-catalog-config';
import type {
  CatalogApp,
  CatalogCategory,
  CatalogCopy,
} from './apps-catalog-types';

export function AppsCatalog({
  apps,
  categories,
  copy,
}: {
  apps: readonly CatalogApp[];
  categories: readonly CatalogCategory[];
  copy: CatalogCopy;
}) {
  const [activeCategory, setActiveCategory] = useState<
    'all' | LaunchableAppCategory
  >('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleApps = useMemo(
    () =>
      apps.filter((app) => {
        if (activeCategory !== 'all' && app.category !== activeCategory) {
          return false;
        }

        if (!normalizedQuery) return true;

        return [app.title, app.description, app.slug, ...app.aliases]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [activeCategory, apps, normalizedQuery]
  );

  return (
    <div>
      <div className="rounded-3xl border border-foreground/10 bg-background/55 p-2 shadow-[0_24px_80px_-48px_rgb(0_0_0/0.7)] backdrop-blur-xl">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-foreground/40" />
            <input
              className="h-12 w-full rounded-2xl border border-transparent bg-foreground/[0.035] pr-11 pl-11 text-sm outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/15 focus:bg-background/70 focus:ring-2 focus:ring-ring/25"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label={copy.clearSearch}
                className="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </label>

          <fieldset className="flex min-w-0 gap-1 overflow-x-auto p-1">
            <legend className="sr-only">{copy.allApps}</legend>
            <CategoryButton
              active={activeCategory === 'all'}
              label={copy.allApps}
              onClick={() => setActiveCategory('all')}
            />
            {categories.map((category) => (
              <CategoryButton
                active={activeCategory === category.slug}
                dot={CATEGORY_TONES[category.slug].dot}
                key={category.slug}
                label={category.label}
                onClick={() => setActiveCategory(category.slug)}
              />
            ))}
          </fieldset>
        </div>
      </div>

      {visibleApps.length === 0 ? (
        <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-foreground/10 border-dashed px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/[0.035] text-foreground/45">
            <Search className="size-5" />
          </span>
          <h3 className="mt-5 font-display font-semibold text-xl">
            {copy.emptyTitle}
          </h3>
          <p className="mt-2 max-w-sm text-foreground/50 text-sm leading-relaxed">
            {copy.emptyDescription}
          </p>
        </div>
      ) : (
        <div className="mt-12 space-y-16">
          {categories.map((category, categoryIndex) => {
            const categoryApps = visibleApps.filter(
              (app) => app.category === category.slug
            );

            if (categoryApps.length === 0) return null;

            return (
              <section
                aria-labelledby={`category-${category.slug}`}
                className="scroll-mt-24"
                id={category.slug}
                key={category.slug}
              >
                <header className="mb-6 grid gap-3 border-foreground/[0.08] border-t pt-6 md:grid-cols-[minmax(0,0.7fr)_minmax(18rem,0.3fr)] md:items-end">
                  <div>
                    <div className="flex items-center gap-3 font-mono-ui text-[0.65rem] text-foreground/40 uppercase tracking-[0.2em]">
                      <span className="tabular-nums">
                        {String(categoryIndex + 1).padStart(2, '0')}
                      </span>
                      <span className="h-px w-8 bg-gradient-to-r from-foreground/25 to-transparent" />
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            CATEGORY_TONES[category.slug].dot
                          )}
                        />
                        {category.label}
                      </span>
                    </div>
                    <h2
                      className="mt-3 font-display font-semibold text-3xl tracking-[-0.03em]"
                      id={`category-${category.slug}`}
                    >
                      {category.label}
                    </h2>
                  </div>
                  <p className="max-w-lg text-foreground/50 text-sm leading-relaxed md:justify-self-end md:text-right">
                    {category.description}
                  </p>
                </header>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {categoryApps.map((app) => (
                    <AppCatalogCard
                      app={app}
                      categoryLabel={category.label}
                      key={app.slug}
                      openLabel={copy.openApp}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryButton({
  active,
  dot,
  label,
  onClick,
}: {
  active: boolean;
  dot?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      {dot ? <span className={cn('size-1.5 rounded-full', dot)} /> : null}
      {label}
    </button>
  );
}
