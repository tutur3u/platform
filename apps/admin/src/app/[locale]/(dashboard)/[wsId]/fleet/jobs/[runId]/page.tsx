import { AlertTriangle, ArrowLeft, ListChecks } from '@tuturuuu/icons';
import {
  LogLines,
  OpsPageHeader,
  OpsSection,
  StatePanel,
} from '@tuturuuu/ui/custom/ops';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { buildMachineView } from '@/lib/fleet/fleet-view';
import { formatUtcClock, formatUtcTime } from '@/lib/fleet/format';
import {
  type FleetRunDetail,
  getFleetRunDetail,
  RUN_LOG_LIMIT,
} from '@/lib/fleet/run-detail';
import {
  getRunState,
  isActiveRunStatus,
  RUN_STATE_TONE,
} from '@/lib/fleet/run-state';
import { stopDevboxRunAction } from '../../../devboxes/actions';
import { loadFleetPage } from '../../_components/fleet-data';
import { RunStatePill } from '../../_components/machine-state-pill';
import { RunSourceLabel } from '../../_components/run-source-label';
import { RunExecutionFacts, RunSourceFacts } from './run-facts';
import { getRunRecovery } from './run-recovery';

export const metadata: Metadata = {
  title: 'Run',
  description: 'Source, execution, result and log for one devbox run.',
};

interface Props {
  params: Promise<{ runId: string; wsId: string }>;
}

const buttonClassName =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';

async function loadRun(runId: string) {
  try {
    return { detail: await getFleetRunDetail(runId), ok: true as const };
  } catch (error) {
    console.error('Fleet run detail failed', error);
    return { ok: false as const };
  }
}

export default async function FleetRunPage({ params }: Props) {
  await connection();
  const { runId, wsId } = await params;
  const [{ canManage, locale, now, result, t }, loaded] = await Promise.all([
    loadFleetPage(wsId),
    loadRun(runId),
  ]);
  const backLink = (
    <Link className={buttonClassName} href={`/${wsId}/fleet/jobs`}>
      <ArrowLeft />
      {t('jobs.title')}
    </Link>
  );

  const detail: FleetRunDetail | null = loaded.ok ? loaded.detail : null;
  if (!detail) {
    return (
      <div className="space-y-4">
        <OpsPageHeader
          actions={backLink}
          icon={<ListChecks />}
          title={t('jobs.title')}
        />
        <StatePanel
          detail={loaded.ok ? t('jobs.detail.not_found_detail') : undefined}
          icon={<AlertTriangle />}
          title={
            loaded.ok
              ? t('jobs.detail.not_found_title')
              : t('jobs.detail.load_failed')
          }
          tone={loaded.ok ? 'neutral' : 'critical'}
        />
      </div>
    );
  }

  const { events, eventsTruncated, run } = detail;
  const runner =
    result.ok && run.runner_id
      ? result.snapshot.runners.find((entry) => entry.id === run.runner_id)
      : undefined;
  const machine =
    runner && result.ok ? buildMachineView(runner, result.snapshot, now) : null;
  const state = getRunState(run.status, machine?.status.state);
  const recovery = getRunRecovery(run, state, t);
  const canStop =
    canManage &&
    isActiveRunStatus(run.status) &&
    run.status !== 'cancel_requested';

  return (
    <div className="space-y-4">
      <OpsPageHeader
        actions={
          <>
            {backLink}
            {canStop ? (
              <form action={stopDevboxRunAction.bind(null, wsId, run.id)}>
                <button className={buttonClassName} type="submit">
                  {t('jobs.detail.stop')}
                </button>
              </form>
            ) : null}
          </>
        }
        icon={<ListChecks />}
        meta={
          <>
            <RunStatePill rawStatus={run.status} state={state} t={t} />
            <span>{t('snapshot', { time: formatUtcTime(now, locale) })}</span>
          </>
        }
        title={<RunSourceLabel command={run.command} t={t} />}
      />

      {recovery ? (
        <StatePanel title={recovery} tone={RUN_STATE_TONE[state]} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <OpsSection title={t('jobs.detail.sections.source')}>
          <RunSourceFacts run={run} t={t} />
        </OpsSection>
        <OpsSection title={t('jobs.detail.sections.execution')}>
          <RunExecutionFacts
            locale={locale}
            machineName={machine?.name ?? null}
            now={now}
            run={run}
            state={state}
            t={t}
            wsId={wsId}
          />
        </OpsSection>
      </div>

      <OpsSection
        count={events.length}
        flush
        title={t('jobs.detail.sections.log')}
      >
        {eventsTruncated ? (
          <p className="border-border border-b px-4 py-2 text-muted-foreground text-xs">
            {t('jobs.detail.log_truncated', { count: RUN_LOG_LIMIT })}
          </p>
        ) : null}
        <LogLines
          emptyLabel={t('jobs.detail.log_empty')}
          label={t('jobs.detail.log_label')}
          lines={events.map((event) => ({
            id: event.id,
            kind: event.event_type,
            text: event.message ?? '',
            time: formatUtcClock(event.created_at, locale),
            tone: event.event_type === 'error' ? 'critical' : undefined,
          }))}
        />
      </OpsSection>
    </div>
  );
}
