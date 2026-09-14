'use client';

import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Layers3,
  LayoutGrid,
  RotateCcw,
  Search,
  Server,
} from '@tuturuuu/icons/lucide';
import {
  COMPARISON_TIERS,
  type ComparisonTier,
} from '@tuturuuu/utils/commercial-comparison';
import type { ComponentType } from 'react';
import type { ComparisonCopy } from './commercial-comparison';
import {
  comparisonFocus,
  comparisonTierStyle,
} from './commercial-comparison-style';

interface Props {
  copy: ComparisonCopy;
  query: string;
  app: string;
  category: string;
  differences: boolean;
  internal: boolean;
  details: boolean;
  tiers: ComparisonTier[];
  appIds: string[];
  onQuery: (value: string) => void;
  onApp: (value: string) => void;
  onCategory: (value: string) => void;
  onDifferences: (value: boolean) => void;
  onInternal: (value: boolean) => void;
  onDetails: (value: boolean) => void;
  onTier: (tier: ComparisonTier) => void;
  onReset: () => void;
}

function FilterToggle({
  label,
  checked,
  onChange,
  Icon,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
  return (
    <label
      className={`relative inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring ${checked ? 'border-dynamic-blue/25 bg-dynamic-blue/10 text-foreground' : 'border-transparent text-foreground/60 hover:bg-foreground/5 hover:text-foreground'}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
      {checked && <Check aria-hidden className="size-3" />}
    </label>
  );
}

export function ComparisonToolbar(p: Props) {
  const selectClass = `h-12 w-full appearance-none rounded-xl border border-foreground/10 bg-transparent pr-9 pl-10 text-sm text-foreground transition-colors hover:border-foreground/25 ${comparisonFocus}`;
  return (
    <div className="relative rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-3 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr]">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">{p.copy.search}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-4 left-4 size-4 text-foreground/45"
          />
          <input
            type="search"
            className={`h-12 w-full rounded-xl border border-foreground/10 bg-background/40 pr-4 pl-11 text-sm placeholder:text-foreground/45 ${comparisonFocus}`}
            placeholder={p.copy.search}
            value={p.query}
            onChange={(event) => p.onQuery(event.target.value)}
          />
        </label>
        <label className="relative block">
          <span className="sr-only">{p.copy.app}</span>
          <LayoutGrid
            aria-hidden
            className="pointer-events-none absolute top-4 left-3.5 size-4 text-dynamic-blue"
          />
          <select
            className={selectClass}
            value={p.app}
            onChange={(event) => p.onApp(event.target.value)}
          >
            <option value="all" className="bg-background">
              {p.copy.allApps}
            </option>
            {p.appIds.map((key) => (
              <option className="bg-background" key={key} value={key}>
                {p.copy.apps[key]}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-4 right-3 size-4 text-foreground/40"
          />
        </label>
        <label className="relative block">
          <span className="sr-only">{p.copy.category}</span>
          <Layers3
            aria-hidden
            className="pointer-events-none absolute top-4 left-3.5 size-4 text-dynamic-purple"
          />
          <select
            className={selectClass}
            value={p.category}
            onChange={(event) => p.onCategory(event.target.value)}
          >
            <option value="all" className="bg-background">
              {p.copy.allCategories}
            </option>
            {Object.entries(p.copy.categories)
              .filter(([key]) => p.internal || key !== 'internal')
              .map(([key, label]) => (
                <option className="bg-background" key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-4 right-3 size-4 text-foreground/40"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <FilterToggle
          label={p.copy.differences}
          checked={p.differences}
          onChange={p.onDifferences}
          Icon={ArrowRightLeft}
        />
        <FilterToggle
          label={p.copy.details}
          checked={p.details}
          onChange={p.onDetails}
          Icon={CircleHelp}
        />
        <FilterToggle
          label={p.copy.internal}
          checked={p.internal}
          onChange={p.onInternal}
          Icon={Server}
        />
        <button
          type="button"
          className={`ml-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-foreground/50 text-xs transition-colors hover:bg-foreground/5 hover:text-foreground ${comparisonFocus}`}
          onClick={p.onReset}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {p.copy.reset}
        </button>
      </div>
      <fieldset className="mt-5 grid grid-cols-2 gap-2 border-foreground/10 border-t pt-4 sm:grid-cols-4">
        <legend className="pr-3 font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.15em]">
          {p.copy.tiers}
        </legend>
        {COMPARISON_TIERS.map((tier) => {
          const { Icon, color, surface } = comparisonTierStyle[tier];
          const selected = p.tiers.includes(tier);
          return (
            <button
              type="button"
              key={tier}
              aria-pressed={selected}
              disabled={p.tiers.length === 1 && selected}
              onClick={() => p.onTier(tier)}
              className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-default sm:px-4 ${selected ? surface : 'border-foreground/10 bg-transparent opacity-50 hover:opacity-100'} ${comparisonFocus}`}
            >
              <Icon aria-hidden className={`size-4 shrink-0 ${color}`} />
              <span className="min-w-0 flex-1 font-medium text-sm">
                {p.copy.tierNames[tier]}
              </span>
              <span
                aria-hidden
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${selected ? `${color} border-current` : 'border-foreground/20'}`}
              >
                {selected && <Check className="size-2.5" />}
              </span>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
