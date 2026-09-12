'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { ReportStatusDashboard } from './report-status-dashboard';

export function PeriodicReportsLoading() {
  const t = useTranslations('reports-hub');
  return (
    <div className="space-y-4">
      <ReportStatusDashboard
        totalLabel={t('total_reports')}
        actions={<Skeleton className="h-8 w-32" />}
        toolbar={
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        }
      >
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={`count-${index}`}
            className="space-y-2 rounded-xl border px-3.5 py-3"
          >
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </ReportStatusDashboard>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 7 }, (_, index) => (
          <Card key={`report-${index}`}>
            <CardContent className="flex items-center gap-4 p-3 md:p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-56 max-w-1/2" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-64 max-w-2/3" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="size-8 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PeriodicReportsRowsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <Card key={`next-report-${index}`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="size-8" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
