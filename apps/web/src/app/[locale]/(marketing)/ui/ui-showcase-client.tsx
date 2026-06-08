'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ComponentCard } from './component-card';
import {
  type ComponentEntry,
  categoryIds,
  componentEntries,
} from './component-registry';
import { ShowcaseControls } from './showcase-controls';
import type { CategoryFilter, ShowcaseSettings } from './showcase-types';

const defaultSettings: ShowcaseSettings = {
  density: 'comfortable',
  radius: 'rounded',
  surface: 'plain',
  showCode: true,
  showCustomizations: true,
};

function matchesQuery(entry: ComponentEntry, query: string) {
  if (!query) return true;
  const haystack = [
    entry.name,
    entry.id,
    entry.importPath,
    entry.category,
    ...entry.exports,
    ...entry.customizationKeys,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function UiShowcaseClient() {
  const t = useTranslations('ui-showcase');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [settings, setSettings] = useState<ShowcaseSettings>(defaultSettings);

  const categoryCounts = useMemo(() => {
    const counts = { all: componentEntries.length } as Record<
      CategoryFilter,
      number
    >;

    for (const id of categoryIds) {
      counts[id] = componentEntries.filter(
        (entry) => entry.category === id
      ).length;
    }

    return counts;
  }, []);

  const filteredEntries = useMemo(
    () =>
      componentEntries.filter((entry) => {
        const categoryMatch = category === 'all' || entry.category === category;
        return categoryMatch && matchesQuery(entry, query.trim());
      }),
    [category, query]
  );

  return (
    <main className="bg-root-background">
      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 md:px-8 md:py-14">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{t('hero.eyebrow')}</Badge>
            <Badge variant="secondary">
              {t('hero.count', { count: componentEntries.length })}
            </Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="grid max-w-4xl gap-4">
              <h1 className="text-balance font-semibold text-4xl md:text-5xl">
                {t('hero.title')}
              </h1>
              <p className="text-balance text-lg text-muted-foreground leading-8">
                {t('hero.description')}
              </p>
            </div>
            <div className="grid gap-3 rounded-lg border bg-background p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <HeroMetric
                  label={t('hero.metrics.components')}
                  value={componentEntries.length}
                />
                <HeroMetric
                  label={t('hero.metrics.categories')}
                  value={categoryIds.length}
                />
                <HeroMetric
                  label={t('hero.metrics.live')}
                  value={
                    componentEntries.filter(
                      (entry) => entry.safePreview !== false
                    ).length
                  }
                />
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href="#component-button">{t('hero.primaryAction')}</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/branding">{t('hero.secondaryAction')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ShowcaseControls
            category={category}
            categoryCounts={categoryCounts}
            onCategoryChange={setCategory}
            onQueryChange={setQuery}
            onReset={() => {
              setQuery('');
              setCategory('all');
              setSettings(defaultSettings);
            }}
            onSettingsChange={setSettings}
            query={query}
            settings={settings}
          />

          <div className="grid gap-5">
            <div className="flex flex-col gap-2 rounded-lg border bg-background p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-xl">{t('catalog.title')}</h2>
                <p className="text-muted-foreground text-sm">
                  {t('catalog.description', { count: filteredEntries.length })}
                </p>
              </div>
              <Badge variant="outline">
                {category === 'all'
                  ? t('controls.all')
                  : t(`categories.${category}`)}
              </Badge>
            </div>

            {filteredEntries.length ? (
              filteredEntries.map((entry) => (
                <ComponentCard
                  entry={entry}
                  key={entry.id}
                  settings={settings}
                />
              ))
            ) : (
              <div className="grid min-h-80 place-items-center rounded-lg border bg-background p-8 text-center">
                <div className="grid max-w-md gap-2">
                  <h2 className="font-semibold text-xl">{t('empty.title')}</h2>
                  <p className="text-muted-foreground">
                    {t('empty.description')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-md bg-muted/50 px-3 py-2">
      <div className="font-semibold text-2xl">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
