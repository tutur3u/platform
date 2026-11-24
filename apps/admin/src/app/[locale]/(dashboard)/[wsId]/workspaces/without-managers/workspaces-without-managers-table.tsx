import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { WorkspaceManagerGapRow } from '@/lib/workspace-manager-gaps';

export async function WorkspacesWithoutManagersTable({
  rows,
}: {
  rows: WorkspaceManagerGapRow[];
}) {
  const t = await getTranslations('workspace-manager-gaps');
  const format = await getFormatter();

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('col_name')}</TableHead>
            <TableHead>{t('col_id')}</TableHead>
            <TableHead>{t('col_creator_id')}</TableHead>
            <TableHead className="text-right">
              {t('col_full_members')}
            </TableHead>
            <TableHead>{t('col_created_at')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center" colSpan={5}>
                {t('empty')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.wsId}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="font-mono text-xs">{row.wsId}</TableCell>
                <TableCell className="font-mono text-xs">
                  {row.creatorId}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(row.fullMemberCount)}
                </TableCell>
                <TableCell>
                  {format.dateTime(new Date(row.createdAt), {
                    dateStyle: 'medium',
                  })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
