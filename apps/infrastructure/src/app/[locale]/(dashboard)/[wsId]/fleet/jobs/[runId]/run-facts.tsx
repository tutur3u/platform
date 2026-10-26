import Link from 'next/link';
import type { DevboxAdminRun } from '@/lib/devboxes/admin-store';
import {
  ageSince,
  formatDurationSeconds,
  formatUtcTime,
} from '@/lib/fleet/format';
import { describeRunSource } from '@/lib/fleet/run-source';
import type { RunState } from '@/lib/fleet/run-state';
import type { FleetTranslator } from '../../_components/fleet-data';

const dl =
  'grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]';
const dd = 'min-w-0 break-words font-mono text-xs leading-5';

export function RunSourceFacts({
  run,
  t,
}: {
  run: DevboxAdminRun;
  t: FleetTranslator;
}) {
  const source = describeRunSource(run.command);
  if (source.kind === 'invalid_envelope') {
    return <p className="text-sm">{t('jobs.source.invalid')}</p>;
  }
  if (source.kind === 'maintenance') {
    return (
      <p className="text-sm">
        {t('jobs.source.maintenance', { name: source.name })}
      </p>
    );
  }

  return (
    <dl className={dl}>
      {source.kind === 'commit' ? (
        <>
          <dt className="text-muted-foreground">{t('jobs.source.commit')}</dt>
          <dd className={dd}>{source.sha}</dd>
          <dt className="text-muted-foreground">
            {t('jobs.source.directory')}
          </dt>
          <dd className={dd}>
            {source.prefix || t('jobs.source.repository_root')}
          </dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">{t('jobs.source.command')}</dt>
      <dd className={dd}>{source.argv.join(' ') || '-'}</dd>
    </dl>
  );
}

export function RunExecutionFacts({
  locale,
  machineName,
  now,
  run,
  state,
  t,
  wsId,
}: {
  locale: string;
  machineName: string | null;
  now: Date;
  run: DevboxAdminRun;
  state: RunState;
  t: FleetTranslator;
  wsId: string;
}) {
  const notYet = t('jobs.detail.not_yet');
  const elapsed =
    run.started_at && state !== 'outcome_unknown'
      ? ageSince(
          run.started_at,
          run.completed_at ? new Date(run.completed_at) : now
        )
      : null;

  return (
    <dl className={dl}>
      <dt className="text-muted-foreground">{t('jobs.detail.run_id')}</dt>
      <dd className={dd}>{run.id}</dd>
      <dt className="text-muted-foreground">{t('jobs.detail.machine')}</dt>
      <dd className={dd}>
        {run.runner_id ? (
          <Link
            className="hover:underline"
            href={`/${wsId}/fleet/machines/${run.runner_id}`}
          >
            {machineName ?? run.runner_id}
          </Link>
        ) : (
          t('jobs.unassigned')
        )}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.detail.requested')}</dt>
      <dd className={dd}>{formatUtcTime(run.created_at, locale)}</dd>
      <dt className="text-muted-foreground">{t('jobs.detail.started')}</dt>
      <dd className={dd}>
        {run.started_at ? formatUtcTime(run.started_at, locale) : notYet}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.detail.completed')}</dt>
      <dd className={dd}>
        {run.completed_at ? formatUtcTime(run.completed_at, locale) : notYet}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.detail.duration')}</dt>
      <dd className={dd}>
        {elapsed === null
          ? '-'
          : formatDurationSeconds(Math.round(elapsed / 1000))}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.detail.timeout')}</dt>
      <dd className={dd}>
        {formatDurationSeconds(run.timeout_seconds) ?? t('jobs.detail.none')}
      </dd>
      <dt className="text-muted-foreground">{t('jobs.detail.exit_code')}</dt>
      <dd className={dd}>{run.exit_code ?? notYet}</dd>
    </dl>
  );
}
