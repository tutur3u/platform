import { CircleStop, RotateCcw } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
} from '@/lib/devboxes/admin-store';
import {
  releaseDevboxLeaseAction,
  revokeDevboxRunnerAction,
  stopDevboxRunAction,
} from './actions';

type DevboxControlTranslator = (key: string) => string;

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function commandLabel(command: string[]) {
  return command.length ? command.join(' ') : '-';
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="secondary">{status}</Badge>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        className="py-8 text-center text-muted-foreground"
        colSpan={colSpan}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-muted-foreground text-sm">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function Section({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-xl">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        {children}
      </div>
    </section>
  );
}

export function RunnersTable({
  canManage,
  runners,
  t,
  wsId,
}: {
  canManage: boolean;
  runners: DevboxAdminRunner[];
  t: DevboxControlTranslator;
  wsId: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.runner')}</TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead>{t('columns.last_heartbeat')}</TableHead>
          <TableHead>{t('columns.updated')}</TableHead>
          <TableHead>{t('columns.actor')}</TableHead>
          {canManage ? <TableHead>{t('columns.actions')}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {runners.length === 0 ? (
          <EmptyRow colSpan={canManage ? 6 : 5} label={t('empty.runners')} />
        ) : (
          runners.map((runner) => (
            <TableRow key={runner.id}>
              <TableCell>
                <div className="font-medium">{runner.name}</div>
                <div className="font-mono text-muted-foreground text-xs">
                  {runner.id}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={runner.status} />
              </TableCell>
              <TableCell>{formatDate(runner.last_heartbeat_at)}</TableCell>
              <TableCell>{formatDate(runner.updated_at)}</TableCell>
              <TableCell className="font-mono text-xs">
                {runner.actor_id}
              </TableCell>
              {canManage ? (
                <TableCell>
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
                </TableCell>
              ) : null}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.command')}</TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead>{t('columns.runner')}</TableHead>
          <TableHead>{t('columns.exit_code')}</TableHead>
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
              <TableCell>
                <div className="max-w-xl font-mono text-sm">
                  {commandLabel(run.command)}
                </div>
                <div className="font-mono text-muted-foreground text-xs">
                  {run.id}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={run.status} />
              </TableCell>
              <TableCell className="font-mono text-xs">
                {run.runner_id ?? '-'}
              </TableCell>
              <TableCell>{run.exit_code ?? '-'}</TableCell>
              <TableCell>{formatDate(run.created_at)}</TableCell>
              {canManage ? (
                <TableCell>
                  <form action={stopDevboxRunAction.bind(null, wsId, run.id)}>
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
                <StatusBadge status={lease.status} />
              </TableCell>
              <TableCell className="font-mono text-xs">
                {lease.runner_id ?? '-'}
              </TableCell>
              <TableCell>{formatDate(lease.expires_at)}</TableCell>
              <TableCell>
                {lease.keep ? t('labels.yes') : t('labels.no')}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <form
                    action={releaseDevboxLeaseAction.bind(null, wsId, lease.id)}
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
  );
}
