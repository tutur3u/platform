import {
  Activity,
  CircleStop,
  Download,
  KeyRound,
  RotateCcw,
  Server,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type {
  DevboxAdminLease,
  DevboxAdminRun,
  DevboxAdminRunner,
  DevboxAdminRunnerToken,
  DevboxRunnerFeature,
} from '@/lib/devboxes/admin-store';
import {
  releaseDevboxLeaseAction,
  restartDevboxRunnerAction,
  revokeDevboxRunnerAction,
  setDevboxRunnerFeatureAction,
  setDevboxRunnerHeartbeatEnabledAction,
  stopDevboxRunAction,
  updateDevboxRunnerAction,
} from './actions';
import {
  type DevboxControlTranslator,
  EmptyRow,
  ToneBadge,
} from './devbox-control-shared';
import {
  commandLabel,
  formatDateTime,
  formatDuration,
  formatRelativeAge,
  getRunnerHealth,
  getRunnerTokenCounts,
  getRunTone,
} from './devbox-control-utils';
import { DevboxResourceLimits } from './devbox-resource-limits';
import {
  getRunnerCapabilitySummary,
  RunnerCapabilitiesCell,
} from './devbox-runner-capabilities';

const actionButtonClassName =
  'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 font-medium text-sm shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const managedFeatures: DevboxRunnerFeature[] = [
  'run',
  'build',
  'serve',
  'tunnel',
  'judge',
];

function isJudgeReady(capabilities: unknown) {
  if (!capabilities || typeof capabilities !== 'object') return false;
  const judge = (capabilities as { judge?: { ready?: boolean } }).judge;
  return judge?.ready === true;
}

export function RunnersTable({
  canManage,
  now,
  runnerTokens,
  runners,
  t,
  wsId,
}: {
  canManage: boolean;
  now: Date;
  runnerTokens: DevboxAdminRunnerToken[];
  runners: DevboxAdminRunner[];
  t: DevboxControlTranslator;
  wsId: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-1 border-border border-b px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold text-sm">{t('sections.runners')}</h2>
          <p className="text-muted-foreground text-xs">
            {t('sections.runners_description')}
          </p>
        </div>
        <Badge variant="outline">
          {runners.length} {t('labels.total')}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.runner')}</TableHead>
              <TableHead>{t('columns.health')}</TableHead>
              <TableHead>{t('columns.heartbeat')}</TableHead>
              <TableHead>{t('columns.last_heartbeat')}</TableHead>
              <TableHead>{t('columns.environment')}</TableHead>
              <TableHead>{t('columns.features')}</TableHead>
              <TableHead>{t('columns.resources')}</TableHead>
              <TableHead>{t('columns.tokens')}</TableHead>
              {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runners.length === 0 ? (
              <EmptyRow
                colSpan={canManage ? 9 : 8}
                label={t('empty.runners')}
              />
            ) : (
              runners.map((runner) => {
                const health = getRunnerHealth(runner, now);
                const tokens = getRunnerTokenCounts(runner.id, runnerTokens);
                const summary = getRunnerCapabilitySummary(
                  runner.capabilities,
                  t
                );

                return (
                  <TableRow id={`runner-${runner.id}`} key={runner.id}>
                    <TableCell className="min-w-72">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {runner.name}
                          </div>
                          <div className="font-mono text-muted-foreground text-xs">
                            {runner.id}
                          </div>
                        </div>
                      </div>
                      {summary.hostname ? (
                        <div className="mt-1 text-muted-foreground text-xs">
                          {summary.hostname}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ToneBadge tone={health.tone}>
                          {t(`health.${health.key}`)}
                        </ToneBadge>
                        <div className="text-muted-foreground text-xs">
                          {runner.status}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ToneBadge
                        tone={runner.heartbeat_enabled ? 'green' : 'muted'}
                      >
                        {runner.heartbeat_enabled
                          ? t('labels.heartbeat_enabled')
                          : t('labels.heartbeat_disabled')}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="min-w-36">
                      <div>
                        {formatRelativeAge(runner.last_heartbeat_at, now)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatDateTime(runner.last_heartbeat_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RunnerCapabilitiesCell
                        capabilities={runner.capabilities}
                        t={t}
                      />
                    </TableCell>
                    <TableCell className="min-w-48">
                      {runner.enabled_features ? (
                        <div className="flex flex-wrap gap-1">
                          {managedFeatures.map((feature) => {
                            const enabled =
                              runner.enabled_features?.[feature] === true;
                            const label = t(`features.${feature}`);
                            return canManage ? (
                              <form
                                action={setDevboxRunnerFeatureAction.bind(
                                  null,
                                  wsId,
                                  runner.id,
                                  feature,
                                  !enabled
                                )}
                                key={feature}
                              >
                                <button
                                  aria-label={`${enabled ? t('actions.disable') : t('actions.enable')} ${label}`}
                                  className={actionButtonClassName}
                                  disabled={
                                    runner.status === 'revoked' ||
                                    (feature === 'judge' &&
                                      !enabled &&
                                      !isJudgeReady(runner.capabilities))
                                  }
                                  type="submit"
                                >
                                  {label}:{' '}
                                  {enabled
                                    ? t('labels.heartbeat_enabled')
                                    : t('labels.heartbeat_disabled')}
                                </button>
                              </form>
                            ) : (
                              <ToneBadge
                                key={feature}
                                tone={enabled ? 'green' : 'muted'}
                              >
                                {label}:{' '}
                                {enabled
                                  ? t('labels.heartbeat_enabled')
                                  : t('labels.heartbeat_disabled')}
                              </ToneBadge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('features.unavailable')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DevboxResourceLimits
                        canManage={canManage}
                        runner={runner}
                        t={t}
                        wsId={wsId}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-mono text-sm">
                            {tokens.active}/{tokens.total}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {t('labels.active_total')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <form
                            action={updateDevboxRunnerAction.bind(
                              null,
                              wsId,
                              runner.id
                            )}
                          >
                            <button
                              className={actionButtonClassName}
                              disabled={
                                runner.status !== 'online' ||
                                !runner.enabled_features
                              }
                              type="submit"
                            >
                              <Download className="h-4 w-4" />
                              {t('actions.update_restart')}
                            </button>
                          </form>
                          <form
                            action={restartDevboxRunnerAction.bind(
                              null,
                              wsId,
                              runner.id
                            )}
                          >
                            <button
                              className={actionButtonClassName}
                              disabled={
                                runner.status !== 'online' ||
                                !runner.enabled_features
                              }
                              type="submit"
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('actions.restart_agent')}
                            </button>
                          </form>
                          <form
                            action={setDevboxRunnerHeartbeatEnabledAction.bind(
                              null,
                              wsId,
                              runner.id,
                              !runner.heartbeat_enabled
                            )}
                          >
                            <button
                              className={actionButtonClassName}
                              disabled={runner.status === 'revoked'}
                              type="submit"
                            >
                              <Activity className="h-4 w-4" />
                              {runner.heartbeat_enabled
                                ? t('actions.disable_heartbeat')
                                : t('actions.enable_heartbeat')}
                            </button>
                          </form>
                          <form
                            action={revokeDevboxRunnerAction.bind(
                              null,
                              wsId,
                              runner.id
                            )}
                          >
                            <button
                              className={actionButtonClassName}
                              disabled={runner.status === 'revoked'}
                              type="submit"
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('actions.revoke')}
                            </button>
                          </form>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function RunsTable({
  canManage,
  runs,
  t,
  wsId,
}: {
  canManage: boolean;
  runs: DevboxAdminRun[];
  t: DevboxControlTranslator;
  wsId: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{t('sections.runs')}</h2>
        <p className="text-muted-foreground text-xs">
          {t('sections.runs_description')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.command')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.runner')}</TableHead>
              <TableHead>{t('columns.duration')}</TableHead>
              <TableHead>{t('columns.created')}</TableHead>
              {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <EmptyRow colSpan={canManage ? 6 : 5} label={t('empty.runs')} />
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="min-w-80">
                    <div className="max-w-2xl truncate font-mono text-sm">
                      {commandLabel(run.command)}
                    </div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {run.id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={getRunTone(run.status)}>
                      {run.status}
                    </ToneBadge>
                    <div className="mt-1 text-muted-foreground text-xs">
                      {run.exit_code === null
                        ? t('labels.no_exit_code')
                        : `${t('columns.exit_code')} ${run.exit_code}`}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.runner_id ?? '-'}
                  </TableCell>
                  <TableCell>
                    {formatDuration(run.started_at, run.completed_at)}
                  </TableCell>
                  <TableCell>{formatDateTime(run.created_at)}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <form
                        action={stopDevboxRunAction.bind(null, wsId, run.id)}
                      >
                        <button
                          className={actionButtonClassName}
                          disabled={!['queued', 'running'].includes(run.status)}
                          type="submit"
                        >
                          <CircleStop className="h-4 w-4" />
                          {t('actions.stop')}
                        </button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function LeasesTable({
  canManage,
  leases,
  t,
  wsId,
}: {
  canManage: boolean;
  leases: DevboxAdminLease[];
  t: DevboxControlTranslator;
  wsId: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <h2 className="font-semibold text-sm">{t('sections.leases')}</h2>
        <p className="text-muted-foreground text-xs">
          {t('sections.leases_description')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.lease')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.runner')}</TableHead>
              <TableHead>{t('columns.expires')}</TableHead>
              <TableHead>{t('columns.keep')}</TableHead>
              {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leases.length === 0 ? (
              <EmptyRow colSpan={canManage ? 6 : 5} label={t('empty.leases')} />
            ) : (
              leases.map((lease) => (
                <TableRow key={lease.id}>
                  <TableCell>
                    <div className="font-mono text-sm">{lease.id}</div>
                    <div className="text-muted-foreground text-xs">
                      {lease.profile ?? t('labels.default_profile')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToneBadge
                      tone={lease.status === 'active' ? 'green' : 'muted'}
                    >
                      {lease.status}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {lease.runner_id ?? '-'}
                  </TableCell>
                  <TableCell>{formatDateTime(lease.expires_at)}</TableCell>
                  <TableCell>
                    {lease.keep ? t('labels.yes') : t('labels.no')}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <form
                        action={releaseDevboxLeaseAction.bind(
                          null,
                          wsId,
                          lease.id
                        )}
                      >
                        <button
                          className={actionButtonClassName}
                          disabled={lease.status !== 'active'}
                          type="submit"
                        >
                          <CircleStop className="h-4 w-4" />
                          {t('actions.release')}
                        </button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
