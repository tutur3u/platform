import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { BalancerRunRow } from '@/lib/balancer/store';

type Labels = Record<
  | 'run'
  | 'state'
  | 'host'
  | 'source'
  | 'lease'
  | 'result'
  | 'requester'
  | 'updated'
  | 'empty'
  | 'unknownHint'
  | 'exitCode',
  string
>;

const variant = (state: BalancerRunRow['state']) =>
  state === 'succeeded'
    ? 'default'
    : state === 'failed' || state === 'setup_failed' || state === 'rejected'
      ? 'destructive'
      : state === 'unknown'
        ? 'outline'
        : 'secondary';

const short = (value: string | null | undefined, length = 12) =>
  value ? value.slice(0, length) : '-';

export function BalancerRunsTable({
  runs,
  labels,
}: {
  runs: BalancerRunRow[];
  labels: Labels;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labels.run}</TableHead>
            <TableHead>{labels.state}</TableHead>
            <TableHead>{labels.host}</TableHead>
            <TableHead>{labels.source}</TableHead>
            <TableHead>{labels.lease}</TableHead>
            <TableHead>{labels.result}</TableHead>
            <TableHead>{labels.requester}</TableHead>
            <TableHead>{labels.updated}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={8}>
                {labels.empty}
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => {
              const reason = run.history.at(-1)?.reason ?? run.blocked_by;
              return (
                <TableRow key={run.run_id}>
                  <TableCell className="min-w-64">
                    <div className="font-mono text-xs">{run.run_id}</div>
                    <div
                      className="max-w-md truncate font-mono text-muted-foreground text-xs"
                      title={run.command.join(' ')}
                    >
                      {run.cwd ? `${run.cwd}$ ` : '$ '}
                      {run.command.join(' ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={variant(run.state)}>{run.state}</Badge>
                    {reason ? (
                      <div
                        className="mt-1 max-w-64 truncate text-muted-foreground text-xs"
                        title={reason}
                      >
                        {reason}
                      </div>
                    ) : null}
                    {run.state === 'unknown' ? (
                      <div className="mt-1 max-w-64 text-muted-foreground text-xs">
                        {labels.unknownHint}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.device_id ?? '-'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div title={run.source_sha}>
                      {run.source_repo}@{short(run.source_sha)}
                    </div>
                    <div
                      className="text-muted-foreground"
                      title={run.source_id}
                    >
                      {short(run.source_id)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div title={run.lease_id ?? undefined}>
                      {short(run.lease_id, 8)}
                    </div>
                    {run.fence ? (
                      <div className="text-muted-foreground">#{run.fence}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.result ? (
                      <>
                        <div>
                          {labels.exitCode} {run.result.exitCode ?? '-'}
                        </div>
                        <div
                          className="text-muted-foreground"
                          title={run.result.logSha256}
                        >
                          {short(run.result.logSha256)}
                        </div>
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-48 truncate font-mono text-xs"
                    title={run.requester.threadId}
                  >
                    {run.requester.threadId ?? run.requester.kind ?? '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {new Date(run.published_at).toISOString().slice(0, 19)}Z
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
