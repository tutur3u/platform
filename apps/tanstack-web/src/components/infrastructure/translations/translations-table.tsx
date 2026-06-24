import { Copy, Eye } from '@tuturuuu/icons';
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
import type { FlatTranslation, TranslationStatus } from './types';

type TranslationsTableProps = {
  copiedKey: string | null;
  labels: {
    actions: string;
    copy: string;
    empty: string;
    english: string;
    key: string;
    status: string;
    statuses: Record<TranslationStatus, string>;
    view: string;
    vietnamese: string;
  };
  onCopy: (text: string) => void;
  onView: (row: FlatTranslation) => void;
  rows: FlatTranslation[];
};

export function TranslationsTable({
  copiedKey,
  labels,
  onCopy,
  onView,
  rows,
}: TranslationsTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">{labels.key}</TableHead>
            <TableHead className="w-[24%]">{labels.english}</TableHead>
            <TableHead className="w-[24%]">{labels.vietnamese}</TableHead>
            <TableHead className="w-[12%]">{labels.status}</TableHead>
            <TableHead className="w-[12%] text-right">
              {labels.actions}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                className="h-24 text-center text-muted-foreground"
                colSpan={5}
              >
                {labels.empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="max-w-[18rem] truncate font-mono text-xs">
                  {row.key}
                </TableCell>
                <TableCell className="max-w-[18rem] truncate">
                  {row.enValue || '-'}
                </TableCell>
                <TableCell className="max-w-[18rem] truncate">
                  {row.viValue || '-'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.status === 'complete' ? 'secondary' : 'outline'
                    }
                  >
                    {labels.statuses[row.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      aria-label={labels.copy}
                      onClick={() => onCopy(row.key)}
                      size="icon"
                      variant={copiedKey === row.key ? 'secondary' : 'ghost'}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={labels.view}
                      onClick={() => onView(row)}
                      size="icon"
                      variant="ghost"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
