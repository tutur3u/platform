import { AlertTriangle, ListChecks, RotateCcw } from '@tuturuuu/icons';
import { OpsPageHeader, OpsSection, StatePanel } from '@tuturuuu/ui/custom/ops';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { buildFleetView, type FleetRunView } from '@/lib/fleet/fleet-view';
import { formatUtcTime } from '@/lib/fleet/format';
import { loadFleetPage } from '../_components/fleet-data';
import { RunsTable } from './runs-table';

export const metadata: Metadata = {
  title: 'Runs',
  description: 'Queued, running and finished devbox runs with their results.',
};

const FILTERS = {
  all: () => true,
  failed: ({ state }: FleetRunView) =>
    state === 'failed' || state === 'timed_out',
  queued: ({ state }: FleetRunView) => state === 'queued',
  running: ({ state }: FleetRunView) =>
    state === 'claimed' || state === 'running' || state === 'cancel_requested',
  unknown: ({ state }: FleetRunView) =>
    state === 'outcome_unknown' || state === 'unrecognized',
} as const;

type FilterKey = keyof typeof FILTERS;
const FILTER_ORDER: FilterKey[] = [
  'all',
  'running',
  'queued',
  'unknown',
  'failed',
];

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ state?: string }>;
}

const linkButtonClassName =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';

export default async function FleetRunsPage({ params, searchParams }: Props) {
  await connection();
  const [{ wsId }, { state: rawFilter }] = await Promise.all([
    params,
    searchParams,
  ]);
  const filter: FilterKey =
    rawFilter && rawFilter in FILTERS ? (rawFilter as FilterKey) : 'all';
  const { locale, now, result, t } = await loadFleetPage(wsId);
  const base = `/${wsId}/fleet/jobs`;

  const header = (
    <OpsPageHeader
      actions={
        <Link
          className={linkButtonClassName}
          href={filter === 'all' ? base : `${base}?state=${filter}`}
        >
          <RotateCcw />
          {t('refresh')}
        </Link>
      }
      icon={<ListChecks />}
      meta={<span>{t('snapshot', { time: formatUtcTime(now, locale) })}</span>}
      title={t('jobs.title')}
    />
  );

  if (!result.ok) {
    return (
      <div className="space-y-4">
        {header}
        <StatePanel
          detail={t('errors.snapshot_detail')}
          icon={<AlertTriangle />}
          title={t('errors.snapshot_title')}
          tone="critical"
        />
      </div>
    );
  }

  const fleet = buildFleetView(result.snapshot, now);
  const counts = Object.fromEntries(
    FILTER_ORDER.map((key) => [key, fleet.runs.filter(FILTERS[key]).length])
  ) as Record<FilterKey, number>;
  const runs = fleet.runs.filter(FILTERS[filter]);

  return (
    <div className="space-y-4">
      {header}
      <nav
        aria-label={t('jobs.filters.label')}
        className="flex flex-wrap gap-2"
      >
        {FILTER_ORDER.map((key) => (
          <Link
            aria-current={key === filter ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm',
              key === filter
                ? 'border-foreground/30 bg-foreground/10 font-medium'
                : 'border-border text-muted-foreground hover:bg-foreground/5'
            )}
            href={key === 'all' ? base : `${base}?state=${key}`}
            key={key}
          >
            {t(`jobs.filters.${key}`)}
            <span className="tabular-nums">{counts[key]}</span>
          </Link>
        ))}
      </nav>
      <OpsSection
        count={runs.length}
        flush
        title={t('jobs.window', { count: fleet.counts.runWindow })}
      >
        <RunsTable locale={locale} now={now} runs={runs} t={t} wsId={wsId} />
      </OpsSection>
    </div>
  );
}
