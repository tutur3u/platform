'use client';

import { BookOpen, Search, Users, Video } from '@tuturuuu/icons';
import type { ScenarioSummary } from '@tuturuuu/meet-core/parley/contracts';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StartSession } from './start-session';

export function SessionSetup({ scenarios }: { scenarios: ScenarioSummary[] }) {
  const t = useTranslations('parley');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? '');
  const selected = scenarios.find((scenario) => scenario.id === selectedId);
  const visible = scenarios.filter((scenario) =>
    `${scenario.title} ${scenario.category} ${scenario.briefing}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4" aria-label={t('choose_scenario')}>
        <label className="block space-y-2" htmlFor="setup-search">
          <span className="font-medium text-sm">{t('search')}</span>
          <div className="relative">
            <Search
              className="absolute top-3 left-3 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="setup-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search_hint')}
              className="pl-9"
            />
          </div>
        </label>
        <p className="text-muted-foreground text-sm" role="status">
          {t('results', { count: visible.length })}
        </p>
        <fieldset className="space-y-3">
          <legend className="sr-only">{t('choose_scenario')}</legend>
          {visible.map((scenario) => (
            <label
              key={scenario.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-5 transition-colors ${selectedId === scenario.id ? 'border-primary bg-accent/40' : 'bg-card hover:bg-muted/40'}`}
            >
              <input
                type="radio"
                name="selected-scenario"
                value={scenario.id}
                checked={selectedId === scenario.id}
                onChange={() => setSelectedId(scenario.id)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 space-y-2">
                <span className="block text-muted-foreground text-xs">
                  {scenario.category} ·{' '}
                  {t('revision', { revision: scenario.revision })}
                </span>
                <span className="block font-semibold">{scenario.title}</span>
                <span className="line-clamp-2 block text-muted-foreground text-sm leading-relaxed">
                  {scenario.briefing}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Users className="size-4" aria-hidden />
                  {t('role_count', { count: scenario.roles.length })}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {!visible.length && (
          <div className="space-y-3 rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">{t('no_results')}</p>
            <Button variant="outline" onClick={() => setQuery('')}>
              {t('clear_filters')}
            </Button>
          </div>
        )}
      </section>
      {selected && (
        <aside
          className="space-y-5 rounded-xl border bg-card p-5 lg:sticky lg:top-6"
          aria-label={t('prepare')}
        >
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
              <Video className="size-4" aria-hidden />
              {t('powered_by_meet')}
            </p>
            <h2 className="font-semibold text-xl tracking-tight">
              {selected.title}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t('prepare_hint')}
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/scenarios/${selected.id}`}>
              <BookOpen className="size-4" />
              {t('view_briefing')}
            </Link>
          </Button>
          <div className="border-t pt-5">
            <StartSession key={selected.id} scenarioId={selected.id} />
          </div>
          <p className="border-t pt-4 text-muted-foreground text-xs leading-relaxed">
            {t('ai_hint')}
          </p>
        </aside>
      )}
    </div>
  );
}
