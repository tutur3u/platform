import { RefreshCw, Search, Server } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { ThreadMachine } from './contract';
import { type StateFilter, stateFilters } from './model';

const CHIP =
  'inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent focus-visible:outline-1 focus-visible:outline-ring/50 disabled:pointer-events-none disabled:opacity-50';
const CHIP_ON =
  'border-primary bg-primary text-primary-foreground hover:bg-primary';

/** Search, state chips and machine chips above the thread list. */
export function ListTools({
  q,
  state,
  counts,
  machines,
  machine,
  refreshing,
  onQuery,
  onState,
  onMachine,
  onRefresh,
}: {
  q?: string;
  state: StateFilter;
  counts?: Record<StateFilter, number>;
  machines: ThreadMachine[];
  machine?: string;
  refreshing: boolean;
  onQuery: (q: string | undefined) => void;
  onState: (state: StateFilter) => void;
  onMachine: (environmentId: string | undefined) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(q ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onQuery(value.trim() || undefined), 300);
  };

  return (
    <div className="space-y-2 border-b p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          type="search"
          maxLength={100}
          value={draft}
          onChange={(event) => search(event.target.value)}
          placeholder={t('projects.search')}
          aria-label={t('projects.search')}
          className="pl-8"
        />
      </div>
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label={t('projects.filter.all')}
      >
        {stateFilters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => onState(value)}
            className={cn(CHIP, state === value && CHIP_ON)}
          >
            {t(`projects.filter.${value}`)}
            {counts ? (
              <span className="tabular-nums opacity-80">{counts[value]}</span>
            ) : null}
          </button>
        ))}
      </div>
      {machines.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="group">
          {machines.map((entry) => {
            const on = (entry.environmentId ?? undefined) === machine;
            return (
              <button
                key={entry.environmentId ?? 'this'}
                type="button"
                aria-pressed={on}
                disabled={!entry.reachable}
                title={entry.reachable ? undefined : t('projects.unreachable')}
                onClick={() => onMachine(entry.environmentId)}
                className={cn(CHIP, on && CHIP_ON)}
              >
                <Server className="size-3" />
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{t('projects.sorted')}</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t('projects.refresh')}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        </Button>
      </div>
    </div>
  );
}
