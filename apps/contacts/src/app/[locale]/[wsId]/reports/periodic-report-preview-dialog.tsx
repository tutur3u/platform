'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Mail } from '@tuturuuu/icons';
import {
  getPeriodicReportEmailPreview,
  type PeriodicReport,
  type PeriodicReportEmailPreview,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PeriodicDeliveryStatus } from './periodic-delivery-status';
import { PeriodicStatusBadge } from './periodic-status-badge';

export type PeriodicEmailPreview = PeriodicReportEmailPreview;

export function PeriodicReportPreviewDialog({
  emailPreview,
  wsId,
  onOpenChange,
  report,
}: {
  wsId: string;
  emailPreview?: PeriodicEmailPreview | null;
  onOpenChange: (open: boolean) => void;
  report: PeriodicReport | null;
}) {
  const t = useTranslations('reports-hub');
  const preview = useQuery({
    queryKey: [
      'periodic-report-email-preview',
      wsId,
      report?.id,
      report?.updated_at,
    ],
    queryFn: () => getPeriodicReportEmailPreview(wsId, report!.id),
    enabled: Boolean(report) && !emailPreview,
    initialData: emailPreview ?? undefined,
    staleTime: 0,
  });
  const previewData = emailPreview ?? preview.data;
  return (
    <Dialog open={Boolean(report)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[92dvh] sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100vw-1rem)] sm:max-w-7xl sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-5">
          <DialogTitle className="truncate text-base">
            {report?.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <Mail className="size-3.5" />
            {t('email_preview_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_18rem] md:overflow-hidden">
          <section
            className="min-h-[55dvh] bg-muted/30 md:min-h-0"
            aria-label={t('preview')}
          >
            {!emailPreview && preview.isPending ? (
              <div className="space-y-4 p-6">
                <Skeleton className="h-16 w-2/3" />
                <Skeleton className="h-72 w-full" />
              </div>
            ) : !emailPreview && preview.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                <p>{t('preview_load_error')}</p>
                <Button
                  variant="outline"
                  onClick={() => void preview.refetch()}
                >
                  {t('retry')}
                </Button>
              </div>
            ) : previewData ? (
              <iframe
                title={t('preview')}
                srcDoc={previewData.html}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[65dvh] w-full border-0 bg-background md:h-full"
              />
            ) : null}
          </section>
          <aside className="space-y-5 border-t p-4 md:overflow-y-auto md:border-t-0 md:border-l">
            {report && (
              <>
                <div className="space-y-3">
                  <PeriodicStatusBadge
                    approval={report.report_approval_status}
                  />
                  <div>
                    <p className="font-medium text-sm">
                      {report.user_name ?? t('unknown_member')}
                    </p>
                    <p className="mt-1 break-words text-muted-foreground text-xs">
                      {report.group_name ?? t('unknown_group')}
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Link href={`/${wsId}/users/reports/${report.id}`}>
                      {t('open_full_report')}
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="border-t pt-4">
                  <PeriodicDeliveryStatus wsId={wsId} reportId={report.id} />
                </div>
              </>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
