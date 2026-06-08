import { FileText } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { DetailCard, EmptyPanel } from './detail-card';
import type { UserReport } from './types';

export function ReportsPanel({
  wsId,
  reports,
  reportCount,
  labels,
}: {
  wsId: string;
  reports: UserReport[];
  reportCount: number;
  labels: {
    empty: string;
    reports: string;
  };
}) {
  return (
    <DetailCard
      title={labels.reports}
      meta={<Badge variant="secondary">{reportCount}</Badge>}
    >
      {reports.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {reports.map((report) => (
            <Button
              key={report.id}
              asChild
              variant="secondary"
              className="h-auto justify-start gap-2 whitespace-normal py-3 text-left"
            >
              <Link href={`/${wsId}/users/reports/${report.id}`}>
                <FileText className="size-4 shrink-0" />
                <span className="line-clamp-2">{report.title}</span>
              </Link>
            </Button>
          ))}
        </div>
      ) : (
        <EmptyPanel>{labels.empty}</EmptyPanel>
      )}
    </DetailCard>
  );
}
