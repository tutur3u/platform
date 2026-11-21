import { cn } from '@tuturuuu/utils/format';
import { toneDot } from '../components/tone';
import { formatAge, useI18n } from '../i18n';
import type { StateCounts, ThreadRow as Row } from './contract';
import { STATE_TONE, unread } from './model';

const COUNT_TEXT = {
  running: 'text-dynamic-green',
  waiting: 'text-dynamic-orange',
  failed: 'text-dynamic-red',
  idle: 'text-muted-foreground',
} as const;

/** Running, waiting and failed as tinted counts; idle as a plain number. */
export function StateCountsLine({ counts }: { counts: StateCounts }) {
  const { t } = useI18n();
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[0.6875rem] tabular-nums">
      {(['running', 'waiting', 'failed', 'idle'] as const)
        .filter((state) => counts[state] > 0)
        .map((state) => (
          <span
            key={state}
            title={t(`projects.filter.${state}`)}
            className={cn(
              'inline-flex items-center gap-0.5',
              COUNT_TEXT[state]
            )}
          >
            <span
              aria-hidden
              className={toneDot(STATE_TONE[state], 'size-1.5')}
            />
            <span className="sr-only">{t(`projects.filter.${state}`)}</span>
            {counts[state]}
          </span>
        ))}
    </span>
  );
}

function Unread({ row }: { row: Row }) {
  const { t } = useI18n();
  const value = unread(row);
  if (value === 0) return null;
  return (
    <span
      className="inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 font-bold text-[0.625rem] text-primary-foreground"
      aria-label={
        value === 'new'
          ? t('projects.new')
          : t('projects.unreadLabel', { n: value })
      }
    >
      {value === 'new' ? t('projects.new') : value}
    </span>
  );
}

/**
 * One thread in the sidebar list. The subtitle names the machine, and the
 * project too when the list is flat.
 */
export function ThreadRow({
  row,
  subtitle,
  selected,
  now,
  nested,
  onSelect,
}: {
  row: Row;
  subtitle?: string;
  selected: boolean;
  now: number;
  nested: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        'grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1.5 pr-2 text-left hover:bg-accent focus-visible:outline-1 focus-visible:outline-ring/50',
        nested ? 'pl-6' : 'pl-2',
        selected && 'bg-accent shadow-[inset_2px_0_0_var(--foreground)]',
        row.state === 'idle' && !selected && 'opacity-60'
      )}
    >
      <span
        aria-label={t(`projects.filter.${row.state}`)}
        className={toneDot(STATE_TONE[row.state])}
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.title}</span>
        {subtitle ? (
          <span className="block truncate text-[0.6875rem] text-muted-foreground leading-4">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-0.5 text-[0.6875rem] text-muted-foreground">
        <span>{formatAge(t, now - Date.parse(row.updatedAt))}</span>
        <Unread row={row} />
      </span>
    </button>
  );
}
