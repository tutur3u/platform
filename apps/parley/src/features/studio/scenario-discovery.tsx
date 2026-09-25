'use client';
import { ArrowUpRight, Compass, Search, Users } from '@tuturuuu/icons';
import type { ScenarioSummary } from '@tuturuuu/meet-core/parley/contracts';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ScenarioDiscovery({
  scenarios,
}: {
  scenarios: ScenarioSummary[];
}) {
  const t = useTranslations('parley');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const categories = [...new Set(scenarios.map((s) => s.category))].sort();
  const visible = scenarios.filter(
    (s) =>
      (!category || s.category === category) &&
      `${s.title} ${s.category} ${s.briefing}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <section className="space-y-5" aria-label={t('library')}>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-4">
        <div className="min-w-48 flex-1 space-y-2">
          <label htmlFor="scenario-search" className="font-medium text-sm">
            {t('search')}
          </label>
          <div className="relative">
            <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              id="scenario-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search_hint')}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="scenario-category"
            className="block font-medium text-sm"
          >
            {t('category')}
          </label>
          <select
            id="scenario-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 min-w-44 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">{t('all_categories')}</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {(query || category) && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('');
              setCategory('');
            }}
          >
            {t('clear_filters')}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm" role="status">
        {t('results', { count: visible.length })}
      </p>
      {!visible.length ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <Compass className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-semibold text-lg">
            {t(scenarios.length ? 'no_results' : 'empty')}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
            {t(scenarios.length ? 'no_results_hint' : 'empty_hint')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <Link
              key={s.id}
              href={`/scenarios/${s.id}`}
              className="group flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-xs">
                  {s.category}
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-lg tracking-tight">
                  {s.title}
                </h2>
                <p className="mt-2 line-clamp-3 text-muted-foreground text-sm leading-relaxed">
                  {s.briefing}
                </p>
              </div>
              <div className="flex items-center justify-between border-t pt-4 text-muted-foreground text-xs">
                <span className="flex items-center gap-2">
                  <Users className="size-4" />
                  {t('role_count', { count: s.roles.length })}
                </span>
                <span>{t('revision', { revision: s.revision })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
