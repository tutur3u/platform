'use client';

import { Check, Info, Search, SlidersHorizontal } from '@tuturuuu/icons/lucide';
import {
  COMPARISON_FEATURES,
  COMPARISON_TIERS,
  type ComparisonTier,
} from '@tuturuuu/utils/commercial-comparison';
import { useId, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface ComparisonCopy {
  title: string;
  description: string;
  search: string;
  allApps: string;
  allCategories: string;
  category: string;
  app: string;
  differences: string;
  internal: string;
  details: string;
  reset: string;
  empty: string;
  results: string;
  feature: string;
  tiers: string;
  notice: string;
  pending: string;
  included: string;
  excluded: string;
  preview: string;
  contract: string;
  seats: string;
  internalValue: string;
  features: Record<string, string>;
  apps: Record<string, string>;
  explanations: Record<string, string>;
  categories: Record<string, string>;
  tierNames: Record<ComparisonTier, string>;
}

export function CommercialComparison({ copy }: { copy: ComparisonCopy }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [app, setApp] = useState('all');
  const [category, setCategory] = useState('all');
  const [differences, setDifferences] = useState(false);
  const [internal, setInternal] = useState(false);
  const [details, setDetails] = useState(false);
  const [tiers, setTiers] = useState<ComparisonTier[]>(COMPARISON_TIERS);
  const normalized = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
  const visible = COMPARISON_FEATURES.filter((row) => {
    if (!internal && row.category === 'internal') return false;
    if (app !== 'all' && row.app !== app) return false;
    if (category !== 'all' && row.category !== category) return false;
    if (
      differences &&
      new Set(tiers.map((tier) => row.values[COMPARISON_TIERS.indexOf(tier)]))
        .size < 2
    )
      return false;
    const text = [
      copy.features[row.id],
      copy.apps[row.app],
      copy.categories[row.category],
      copy.explanations[row.detail],
    ]
      .join(' ')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/đ/g, 'd');
    return normalized.split(/\s+/).every((word) => text.includes(word));
  });
  const appIds = [
    ...new Set(
      COMPARISON_FEATURES.filter(
        (row) => internal || row.category !== 'internal'
      ).map((row) => row.app)
    ),
  ];
  function reset() {
    setQuery('');
    setApp('all');
    setCategory('all');
    setDifferences(false);
    setInternal(false);
    setTiers(COMPARISON_TIERS);
  }
  function toggleTier(tier: ComparisonTier) {
    setTiers((current) =>
      current.includes(tier)
        ? current.length > 1
          ? current.filter((item) => item !== tier)
          : current
        : COMPARISON_TIERS.filter(
            (item) => item === tier || current.includes(item)
          )
    );
  }
  function valueLabel(value: string) {
    if (value === 'internal') return copy.internalValue;
    if (
      value === 'included' ||
      value === 'excluded' ||
      value === 'preview' ||
      value === 'contract' ||
      value === 'seats'
    )
      return copy[value];
    return value;
  }
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-12 min-w-0 space-y-6"
      id="compare-plans"
    >
      <div className="max-w-2xl space-y-3">
        <span className="inline-flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest">
          <SlidersHorizontal aria-hidden="true" size={14} />
          {copy.tiers}
        </span>
        <h3
          className="font-semibold text-2xl tracking-tight sm:text-3xl"
          id={`${id}-title`}
        >
          {copy.title}
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          {copy.description}
        </p>
      </div>
      <p className="rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm leading-relaxed">
        {copy.notice}
      </p>
      <div className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="relative block">
            <span className="sr-only">{copy.search}</span>
            <Search
              aria-hidden="true"
              className="absolute top-3 left-3 size-4 text-muted-foreground"
            />
            <Input
              className="pl-9"
              placeholder={copy.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="sr-only">{copy.app}</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={app}
              onChange={(e) => setApp(e.target.value)}
            >
              <option value="all">{copy.allApps}</option>
              {appIds.map((key) => (
                <option key={key} value={key}>
                  {copy.apps[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">{copy.category}</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">{copy.allCategories}</option>
              {Object.entries(copy.categories)
                .filter(([key]) => internal || key !== 'internal')
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={differences}
              onChange={(e) => setDifferences(e.target.checked)}
            />
            {copy.differences}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={details}
              onChange={(e) => setDetails(e.target.checked)}
            />
            {copy.details}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => {
                setInternal(e.target.checked);
                setApp('all');
                setCategory('all');
              }}
            />
            {copy.internal}
          </label>
          <Button variant="ghost" size="sm" onClick={reset}>
            {copy.reset}
          </Button>
        </div>
        <fieldset className="flex flex-wrap gap-2 border-t pt-4">
          <legend className="px-1 text-muted-foreground text-xs">
            {copy.tiers}
          </legend>
          {COMPARISON_TIERS.map((tier) => (
            <Button
              key={tier}
              variant={tiers.includes(tier) ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={tiers.includes(tier)}
              disabled={tiers.length === 1 && tiers.includes(tier)}
              onClick={() => toggleTier(tier)}
            >
              {tiers.includes(tier) && <Check aria-hidden="true" size={14} />}{' '}
              {copy.tierNames[tier]}
            </Button>
          ))}
        </fieldset>
      </div>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {visible.length} {copy.results}
      </p>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p>{copy.empty}</p>
          <Button variant="outline" className="mt-4" onClick={reset}>
            {copy.reset}
          </Button>
        </div>
      ) : (
        <section
          className="max-h-[70vh] overflow-auto rounded-xl border"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must scroll the comparison region.
          tabIndex={0}
          aria-label={copy.title}
        >
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">{copy.description}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-30 min-w-44 border-b bg-background p-4 sm:min-w-72"
                >
                  {copy.feature}
                </th>
                {tiers.map((tier) => (
                  <th
                    scope="col"
                    key={tier}
                    className="sticky top-0 z-20 min-w-32 border-b bg-background p-4 text-center font-semibold"
                  >
                    {copy.tierNames[tier]}
                  </th>
                ))}
              </tr>
            </thead>
            {appIds.map((appId) => {
              const rows = visible.filter((row) => row.app === appId);
              if (!rows.length) return null;
              return (
                <tbody key={appId}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={tiers.length + 1}
                      className="border-b bg-muted px-4 py-3 font-semibold"
                    >
                      <span className="sticky left-4">{copy.apps[appId]}</span>
                    </th>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 max-w-80 border-b bg-background p-4 font-normal group-hover:bg-muted"
                      >
                        <div className="flex items-start gap-2">
                          <span>{copy.features[row.id]}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={copy.features[row.id]}
                                className="mt-0.5 shrink-0 rounded text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                              >
                                <Info size={15} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {copy.explanations[row.detail]}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {row.pending && (
                          <span className="mt-2 block text-muted-foreground text-xs">
                            {copy.pending}
                          </span>
                        )}
                        {details && (
                          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                            {copy.explanations[row.detail]}
                          </p>
                        )}
                      </th>
                      {tiers.map((tier) => {
                        const value =
                          row.values[COMPARISON_TIERS.indexOf(tier)] ??
                          'excluded';
                        return (
                          <td
                            key={tier}
                            className="border-b p-4 text-center align-middle group-hover:bg-muted/30"
                          >
                            <span
                              className={
                                value === 'excluded'
                                  ? 'text-muted-foreground'
                                  : 'font-medium'
                              }
                            >
                              {valueLabel(value)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </section>
      )}
    </section>
  );
}
