import {
  Activity,
  CircleStop,
  KeyRound,
  RotateCcw,
  Server,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
} from '@/lib/devboxes/admin-store';
import {
  releaseDevboxLeaseAction,
  revokeDevboxRunnerAction,
  setDevboxRunnerHeartbeatEnabledAction,
  stopDevboxRunAction,
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
import {
  getRunnerCapabilitySummary,
  RunnerCapabilitiesCell,
} from './devbox-runner-capabilities';

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
              <TableHead>{t('columns.tokens')}</TableHead>
              {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runners.length === 0 ? (
              <EmptyRow
                colSpan={canManage ? 7 : 6}
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
                  <TableRow key={runner.id}>
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
                            action={setDevboxRunnerHeartbeatEnabledAction.bind(
                              null,
                              wsId,
                              runner.id,
                              !runner.heartbeat_enabled
                            )}
                          >
                            <Button
                              disabled={runner.status === 'revoked'}
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              <Activity className="h-4 w-4" />
                              {runner.heartbeat_enabled
                                ? t('actions.disable_heartbeat')
                                : t('actions.enable_heartbeat')}
                            </Button>
                          </form>
                          <form
                            action={revokeDevboxRunnerAction.bind(
                              null,
                              wsId,
                              runner.id
                            )}
                          >
                            <Button
                              disabled={runner.status === 'revoked'}
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('actions.revoke')}
                            </Button>
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
                        <Button
                          disabled={!['queued', 'running'].includes(run.status)}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          <CircleStop className="h-4 w-4" />
                          {t('actions.stop')}
                        </Button>
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
                        <Button
                          disabled={lease.status !== 'active'}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          <CircleStop className="h-4 w-4" />
                          {t('actions.release')}
                        </Button>
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
