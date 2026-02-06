import { AlertCircle } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { AnimateInView } from './animate-in-view';
import type { SummaryRow } from './legal-types';

interface LegalSummaryCardProps {
  title: string;
  description: string;
  rows: SummaryRow[];
  topicColumnLabel?: string;
  summaryColumnLabel?: string;
}

export function LegalSummaryCard({
  title,
  description,
  rows,
  topicColumnLabel = 'Topic',
  summaryColumnLabel = 'Summary',
}: LegalSummaryCardProps) {
  return (
    <AnimateInView>
      <Card className="bg-dynamic-purple/5 p-6">
        <div className="mb-4 flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-dynamic-purple" />
          <h2 className="font-semibold text-lg">{title}</h2>
        </div>
        <p className="mb-4 text-muted-foreground text-sm">{description}</p>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-45">{topicColumnLabel}</TableHead>
              <TableHead>{summaryColumnLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={typeof row.topic === 'string' ? row.topic : ''}>
                <TableCell className="font-medium">{row.topic}</TableCell>
                <TableCell>{row.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AnimateInView>
  );
}
