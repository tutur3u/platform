import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { FleetRunView } from '@/lib/fleet/fleet-view';
import { formatUtcTime } from '@/lib/fleet/format';
import type { FleetTranslator } from '../../_components/fleet-data';
import { RunStatePill } from '../../_components/machine-state-pill';

export function MachineRuns({
  locale,
  runs,
  t,
}: {
  locale: string;
  runs: FleetRunView[];
  t: FleetTranslator;
}) {
  if (runs.length === 0) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm">
        {t('empty.runs')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('runs.status')}</TableHead>
            <TableHead>{t('runs.command')}</TableHead>
            <TableHead>{t('runs.started')}</TableHead>
            <TableHead className="text-right">{t('runs.exit')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map(({ run, state }) => (
            <TableRow key={run.id}>
              <TableCell>
                <RunStatePill rawStatus={run.status} state={state} t={t} />
              </TableCell>
              <TableCell className="max-w-md truncate font-mono text-xs">
                {run.command.join(' ') || '-'}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                {run.started_at ? formatUtcTime(run.started_at, locale) : '-'}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {run.exit_code ?? '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
