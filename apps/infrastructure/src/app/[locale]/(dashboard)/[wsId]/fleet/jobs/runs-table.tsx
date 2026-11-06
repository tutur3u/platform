import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import Link from 'next/link';
import type { FleetRunView } from '@/lib/fleet/fleet-view';
import {
  ageSince,
  formatDurationSeconds,
  formatUtcTime,
} from '@/lib/fleet/format';
import type { FleetTranslator } from '../_components/fleet-data';
import { RunStatePill } from '../_components/machine-state-pill';
import { RunSourceLabel } from '../_components/run-source-label';

export function RunsTable({
  locale,
  now,
  runs,
  t,
  wsId,
}: {
  locale: string;
  now: Date;
  runs: FleetRunView[];
  t: FleetTranslator;
  wsId: string;
}) {
  if (runs.length === 0) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm">
        {t('jobs.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('jobs.columns.state')}</TableHead>
            <TableHead>{t('jobs.columns.source')}</TableHead>
            <TableHead>{t('jobs.columns.machine')}</TableHead>
            <TableHead>{t('jobs.columns.created')}</TableHead>
            <TableHead>{t('jobs.columns.duration')}</TableHead>
            <TableHead className="text-right">
              {t('jobs.columns.exit')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map(({ machineName, run, state }) => {
            const end = run.completed_at ? new Date(run.completed_at) : now;
            const durationMs =
              run.started_at && state !== 'outcome_unknown'
                ? ageSince(run.started_at, end)
                : null;

            return (
              <TableRow key={run.id}>
                <TableCell>
                  <Link href={`/${wsId}/fleet/jobs/${run.id}`}>
                    <RunStatePill rawStatus={run.status} state={state} t={t} />
                  </Link>
                </TableCell>
                <TableCell className="max-w-md text-xs">
                  <Link
                    className="block min-w-0 hover:underline"
                    href={`/${wsId}/fleet/jobs/${run.id}`}
                  >
                    <RunSourceLabel command={run.command} t={t} />
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {run.runner_id && machineName ? (
                    <Link
                      className="hover:underline"
                      href={`/${wsId}/fleet/machines/${run.runner_id}`}
                    >
                      {machineName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('jobs.unassigned')}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                  {formatUtcTime(run.created_at, locale)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs tabular-nums">
                  {durationMs === null
                    ? '-'
                    : formatDurationSeconds(Math.round(durationMs / 1000))}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {run.exit_code ?? '-'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
