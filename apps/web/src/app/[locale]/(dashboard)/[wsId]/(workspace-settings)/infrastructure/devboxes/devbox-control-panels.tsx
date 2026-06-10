import { AlertTriangle, CheckCircle2, Clock, Server } from '@tuturuuu/icons';
import type {
  DevboxAdminRun,
  DevboxAdminRunner,
} from '@/lib/devboxes/admin-store';
import {
  CommandBlock,
  type DevboxControlTranslator,
  ToneBadge,
} from './devbox-control-shared';
import {
  commandLabel,
  devboxToneClasses,
  formatDateTime,
  formatRelativeAge,
  getRunnerHealth,
  getRunTone,
} from './devbox-control-utils';

export function HealthStat({
  description,
  icon,
  label,
  tone,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof devboxToneClasses;
  value: number | string;
}) {
  return (
    <div
      className={`rounded-lg border bg-background px-3 py-2 ${devboxToneClasses[tone].border}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        <span className={devboxToneClasses[tone].text}>{icon}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold text-2xl tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
    </div>
  );
}

export function SetupVisibilityPanel({
  missingHeartbeatCount,
  setupCommand,
  t,
}: {
  missingHeartbeatCount: number;
  setupCommand: string;
  t: DevboxControlTranslator;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="flex items-start gap-3 border-border border-b px-4 py-3">
        <div className="rounded-md border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-2 text-dynamic-yellow">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-semibold text-sm">
            {t('setup_visibility.title')}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t('setup_visibility.description')}
          </p>
        </div>
        <ToneBadge tone={missingHeartbeatCount > 0 ? 'amber' : 'green'}>
          {missingHeartbeatCount > 0
            ? t('setup_visibility.action_needed')
            : t('setup_visibility.ready')}
        </ToneBadge>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-2 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
            <span>{t('setup_visibility.setup_only')}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
            <span>{t('setup_visibility.registration_required')}</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
            <span>{t('setup_visibility.same_origin')}</span>
          </div>
        </div>
        <CommandBlock command={setupCommand} />
      </div>
    </section>
  );
}

export function FleetAlerts({
  runners,
  t,
  now,
}: {
  now: Date;
  runners: DevboxAdminRunner[];
  t: DevboxControlTranslator;
}) {
  const flagged = runners
    .map((runner) => ({ health: getRunnerHealth(runner, now), runner }))
    .filter(({ health }) => health.key !== 'online' && health.key !== 'revoked')
    .slice(0, 5);

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{t('sections.fleet_alerts')}</h2>
        <p className="text-muted-foreground text-xs">
          {t('sections.fleet_alerts_description')}
        </p>
      </div>
      <div className="divide-y divide-border">
        {flagged.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">
            {t('empty.alerts')}
          </div>
        ) : (
          flagged.map(({ health, runner }) => (
            <div className="flex items-start gap-3 p-4" key={runner.id}>
              <span
                className={`mt-1 h-2 w-2 rounded-full ${devboxToneClasses[health.tone].dot}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">
                  {runner.name}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t(`health.${health.key}`)}
                  {' · '}
                  {formatRelativeAge(runner.last_heartbeat_at, now)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function RecentFailures({
  runs,
  t,
}: {
  runs: DevboxAdminRun[];
  t: DevboxControlTranslator;
}) {
  const failures = runs
    .filter((run) => ['failed', 'timed_out', 'cancelled'].includes(run.status))
    .slice(0, 4);

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{t('sections.failures')}</h2>
        <p className="text-muted-foreground text-xs">
          {t('sections.failures_description')}
        </p>
      </div>
      <div className="divide-y divide-border">
        {failures.length === 0 ? (
          <div className="p-4 text-muted-foreground text-sm">
            {t('empty.failures')}
          </div>
        ) : (
          failures.map((run) => (
            <div className="space-y-1 p-4" key={run.id}>
              <div className="flex items-center justify-between gap-3">
                <ToneBadge tone={getRunTone(run.status)}>
                  {run.status}
                </ToneBadge>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(run.created_at)}
                </span>
              </div>
              <div className="truncate font-mono text-sm">
                {commandLabel(run.command)}
              </div>
              <div className="text-muted-foreground text-xs">
                {run.exit_code === null
                  ? t('labels.no_exit_code')
                  : `${t('columns.exit_code')} ${run.exit_code}`}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function QueueSummary({
  queuedRuns,
  runningRuns,
  t,
}: {
  queuedRuns: number;
  runningRuns: number;
  t: DevboxControlTranslator;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{t('sections.queue')}</h2>
        <p className="text-muted-foreground text-xs">
          {t('sections.queue_description')}
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Clock className="h-4 w-4" />
            {t('metrics.queued_runs')}
          </div>
          <div className="mt-1 font-semibold text-2xl tabular-nums">
            {queuedRuns}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Server className="h-4 w-4" />
            {t('metrics.running_runs')}
          </div>
          <div className="mt-1 font-semibold text-2xl tabular-nums">
            {runningRuns}
          </div>
        </div>
      </div>
    </section>
  );
}
