'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Plus, RefreshCw } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  listPeriodicReports,
  type PeriodicReport,
  type PeriodicReportCadence,
  requestPeriodicReportDelivery,
  requestPeriodicReportGeneration,
  updatePeriodicReport,
} from '@tuturuuu/internal-api/reports';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import GroupReportsSelector from '../users/reports/group-reports-selector';
import { PeriodicDeliveryConfirmation } from './periodic-delivery-confirmation';
import { PeriodicEmailReadiness } from './periodic-email-readiness';
import {
  type PeriodicEmailPreview,
  PeriodicReportPreviewDialog,
} from './periodic-report-preview-dialog';
import {
  type PeriodicDeliveryAction,
  PeriodicReportRow,
} from './periodic-report-row';
import {
  PeriodicReportsLoading,
  PeriodicReportsRowsLoading,
} from './periodic-reports-loading';
import {
  type PeriodicApprovalFilter,
  type PeriodicDeliveryFilter,
  PeriodicReportsToolbar,
  type PeriodicSortBy,
  type PeriodicSortDirection,
} from './periodic-reports-toolbar';
import { PeriodicStatusSummary } from './periodic-status-summary';

export default function PeriodicReportsPanel({
  permissions,
  wsId,
}: {
  permissions: {
    canApproveReports: boolean;
    canCheckUserAttendance: boolean;
    canCreateReports: boolean;
    canDeleteReports: boolean;
    canSendReports: boolean;
    canUpdateReports: boolean;
  };
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const queryClient = useQueryClient();
  const [cadence, setCadence] = useState<PeriodicReportCadence>('monthly');
  const [query, setQuery] = useState('');
  const [approvalStatus, setApprovalStatus] =
    useState<PeriodicApprovalFilter>('all');
  const [deliveryStatus, setDeliveryStatus] =
    useState<PeriodicDeliveryFilter>('all');
  const [sortBy, setSortBy] = useState<PeriodicSortBy>('period');
  const [sortDirection, setSortDirection] =
    useState<PeriodicSortDirection>('desc');
  const [debouncedQuery] = useDebounce(query.trim(), 300);
  const [deliveryIntent, setDeliveryIntent] = useState<{
    action: PeriodicDeliveryAction;
    report: PeriodicReport;
  } | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    emailPreview?: PeriodicEmailPreview | null;
    report: PeriodicReport;
  } | null>(null);

  const reportsQuery = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: [
      'periodic-reports',
      wsId,
      cadence,
      debouncedQuery,
      approvalStatus,
      deliveryStatus,
      sortBy,
      sortDirection,
    ],
    queryFn: ({ pageParam }) =>
      listPeriodicReports(wsId, {
        approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus,
        cadence,
        deliveryStatus: deliveryStatus === 'all' ? undefined : deliveryStatus,
        page: pageParam,
        pageSize: 20,
        query: debouncedQuery || undefined,
        sortBy,
        sortDirection,
      }),
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 15_000,
  });
  const reports = reportsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const counts = reportsQuery.data?.pages[0]?.counts;
  const totalReports = reportsQuery.data?.pages[0]?.total ?? 0;
  const numberFormatter = new Intl.NumberFormat();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['periodic-reports', wsId] }),
      queryClient.invalidateQueries({
        queryKey: ['periodic-report-delivery', wsId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['periodic-report-email-preview', wsId],
      }),
    ]);

  const generationMutation = useMutation({
    mutationFn: (reportId: string) =>
      requestPeriodicReportGeneration(wsId, reportId),
    onSuccess: async () => {
      toast.success(t('generation_ready'));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const approvalMutation = useMutation({
    mutationFn: (reportId: string) =>
      updatePeriodicReport(wsId, reportId, {
        report_approval_status: 'APPROVED',
      }),
    onSuccess: async () => {
      toast.success(t('approved'));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const deliveryMutation = useMutation({
    mutationFn: ({
      action,
      reportId,
    }: {
      action: 'preview' | PeriodicDeliveryAction;
      reportId: string;
    }) => requestPeriodicReportDelivery(wsId, reportId, action),
    onSuccess: async (result, variables) => {
      toast.success(result.message);
      if (result.preview) {
        const report = reports.find((item) => item.id === variables.reportId);
        if (report) {
          setPreviewSelection({
            emailPreview: result.preview,
            report,
          });
        }
      }
      setDeliveryIntent(null);
      await invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof InternalApiError &&
          error.code === 'REPORT_DELIVERY_UPDATING'
          ? t('delivery_updating')
          : error.message
      ),
  });

  if (reportsQuery.isLoading && !reportsQuery.data) {
    return <PeriodicReportsLoading />;
  }

  return (
    <div className="space-y-4">
      <PeriodicEmailReadiness wsId={wsId} />
      <PeriodicStatusSummary
        counts={counts}
        approval={approvalStatus}
        delivery={deliveryStatus}
        onChange={(approval, delivery) => {
          setApprovalStatus(approval);
          setDeliveryStatus(delivery);
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {t('review_delivery_hint')}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={reportsQuery.isFetching}
          onClick={() => void reportsQuery.refetch()}
        >
          <RefreshCw
            className={`size-3.5 ${reportsQuery.isFetching ? 'animate-spin' : ''}`}
          />
          {t('refresh')}
        </Button>
      </div>

      <PeriodicReportsToolbar
        approvalStatus={approvalStatus}
        cadence={cadence}
        deliveryStatus={deliveryStatus}
        onApprovalStatusChange={setApprovalStatus}
        onCadenceChange={setCadence}
        onDeliveryStatusChange={setDeliveryStatus}
        onQueryChange={setQuery}
        onReset={() => {
          setApprovalStatus('all');
          setDeliveryStatus('all');
        }}
        onSortChange={(nextSortBy, nextDirection) => {
          setSortBy(nextSortBy);
          setSortDirection(nextDirection);
        }}
        query={query}
        isSearching={
          !reportsQuery.isError &&
          (reportsQuery.isLoading ||
            reportsQuery.isPlaceholderData ||
            query.trim() !== debouncedQuery)
        }
        resultCount={totalReports}
        sortBy={sortBy}
        sortDirection={sortDirection}
      />

      <Accordion type="single" collapsible>
        <AccordionItem value="builder" className="rounded-lg border px-4">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('create_manage_reports')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <GroupReportsSelector wsId={wsId} {...permissions} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        {reportsQuery.isError ? (
          <Card>
            <CardContent className="flex min-h-36 flex-col items-center justify-center gap-3 p-4 text-center">
              <p>{t('load_error')}</p>
              <Button
                variant="outline"
                onClick={() => void reportsQuery.refetch()}
              >
                {t('retry')}
              </Button>
            </CardContent>
          </Card>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="font-medium">{t('no_periodic')}</p>
              <p className="text-muted-foreground text-sm">
                {t('no_periodic_description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <PeriodicReportRow
              key={report.id}
              report={report}
              wsId={wsId}
              permissions={permissions}
              generationPending={generationMutation.isPending}
              approvalPending={approvalMutation.isPending}
              onGenerate={() => generationMutation.mutate(report.id)}
              onApprove={() => approvalMutation.mutate(report.id)}
              onPreview={() => setPreviewSelection({ report })}
              onEmailPreview={() =>
                deliveryMutation.mutate({
                  action: 'preview',
                  reportId: report.id,
                })
              }
              onDeliveryIntent={(action) =>
                setDeliveryIntent({ action, report })
              }
            />
          ))
        )}
      </div>

      {reportsQuery.isFetchingNextPage ? (
        <PeriodicReportsRowsLoading />
      ) : reportsQuery.hasNextPage ? (
        <Button
          className="w-full"
          variant="outline"
          onClick={() => void reportsQuery.fetchNextPage()}
        >
          {t('load_more')}
        </Button>
      ) : null}
      {reports.length > 0 ? (
        <p className="text-center text-muted-foreground text-xs">
          {t('showing_periodic', {
            loaded: numberFormatter.format(reports.length),
            total: numberFormatter.format(totalReports),
          })}
        </p>
      ) : null}

      <PeriodicDeliveryConfirmation
        intent={deliveryIntent}
        isPending={deliveryMutation.isPending}
        onCancel={() => setDeliveryIntent(null)}
        onConfirm={() => {
          if (deliveryIntent) {
            deliveryMutation.mutate({
              action: deliveryIntent.action,
              reportId: deliveryIntent.report.id,
            });
          }
        }}
      />
      <PeriodicReportPreviewDialog
        wsId={wsId}
        report={
          reports.find((item) => item.id === previewSelection?.report.id) ??
          previewSelection?.report ??
          null
        }
        emailPreview={previewSelection?.emailPreview}
        onOpenChange={(open) => !open && setPreviewSelection(null)}
      />
    </div>
  );
}
