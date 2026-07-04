import { AlertCircle } from '@tuturuuu/icons/lucide';
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
      <div className="rounded-xl border bg-dynamic-purple/5 p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-dynamic-purple" />
          <h2 className="font-semibold text-lg">{title}</h2>
        </div>
        <p className="mb-4 text-muted-foreground text-sm">{description}</p>
        <div className="mt-4 w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50">
                <th className="h-10 w-45 px-2 text-left align-middle font-medium text-muted-foreground">
                  {topicColumnLabel}
                </th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                  {summaryColumnLabel}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {rows.map((row) => (
                <tr
                  className="border-b transition-colors hover:bg-muted/50"
                  key={typeof row.topic === 'string' ? row.topic : ''}
                >
                  <td className="p-2 align-middle font-medium">{row.topic}</td>
                  <td className="p-2 align-middle">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AnimateInView>
  );
}
