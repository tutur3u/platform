'use client';

import {
  Check,
  FlaskConical,
  ListFilter,
  SearchX,
  SlidersHorizontal,
} from '@tuturuuu/icons/lucide';
import {
  COMPARISON_FEATURES,
  COMPARISON_TIERS,
  type ComparisonTier,
} from '@tuturuuu/utils/commercial-comparison';
import { useId, useState } from 'react';
import { Button } from './button';
import { ComparisonTable } from './commercial-comparison-table';
import { ComparisonToolbar } from './commercial-comparison-toolbar';

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
      ...row.values.map(valueLabel),
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
    setDetails(false);
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
      className="relative mt-16 min-w-0 scroll-mt-28 space-y-6 sm:mt-24"
      id="compare-plans"
    >
      <div
        className="pointer-events-none absolute -top-8 right-0 h-64 w-2/3 rounded-full bg-dynamic-blue/[0.04] blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6 pb-3">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-2 font-mono-ui text-[0.65rem] text-dynamic-blue uppercase tracking-[0.18em]">
            <SlidersHorizontal aria-hidden className="size-3.5" />
            {copy.tiers}
          </span>
          <h3
            className="text-balance font-display font-semibold text-3xl leading-[1.1] tracking-[-0.035em] sm:text-4xl lg:text-5xl"
            id={`${id}-title`}
          >
            {copy.title}
          </h3>
          <p className="max-w-xl text-foreground/55 text-sm leading-relaxed sm:text-base">
            {copy.description}
          </p>
        </div>
      </div>
      <ComparisonToolbar
        copy={copy}
        query={query}
        app={app}
        category={category}
        differences={differences}
        internal={internal}
        details={details}
        tiers={tiers}
        appIds={appIds}
        onQuery={setQuery}
        onApp={setApp}
        onCategory={setCategory}
        onDifferences={setDifferences}
        onDetails={setDetails}
        onTier={toggleTier}
        onReset={reset}
        onInternal={(value) => {
          setInternal(value);
          setApp('all');
          setCategory('all');
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p
          aria-live="polite"
          className="inline-flex items-center gap-2 text-foreground/55 text-xs"
        >
          <ListFilter aria-hidden className="size-3.5 text-dynamic-blue" />
          {visible.length} {copy.results}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-[0.65rem] text-foreground/50">
          <span className="inline-flex items-center gap-1.5">
            <Check aria-hidden className="size-3.5 text-dynamic-green" />
            {copy.included}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical
              aria-hidden
              className="size-3.5 text-dynamic-orange"
            />
            {copy.preview}
          </span>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-foreground/10 border-dashed bg-foreground/[0.02] px-6 py-16 text-center">
          <SearchX aria-hidden className="mb-4 size-8 text-foreground/30" />
          <p className="text-foreground/65 text-sm">{copy.empty}</p>
          <Button
            variant="outline"
            className="mt-5 rounded-full"
            onClick={reset}
          >
            {copy.reset}
          </Button>
        </div>
      ) : (
        <ComparisonTable
          copy={copy}
          visible={visible}
          tiers={tiers}
          appIds={appIds}
          details={details}
          valueLabel={valueLabel}
        />
      )}
    </section>
  );
}
