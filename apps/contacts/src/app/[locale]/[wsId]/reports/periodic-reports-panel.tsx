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
} from '@tuturuuu/internal-api/reports';
import { updateWorkspaceUserApproval } from '@tuturuuu/internal-api/users';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import GroupReportsSelector from '../users/reports/group-reports-selector';
import {
  type PeriodicBatchIntent,
  PeriodicDeliveryBatchDialog,
} from './periodic-delivery-batch-dialog';
import type { DeliveryCategory } from './periodic-delivery-category';
import {
  PeriodicDeliveryConfirmation,
  type PeriodicDeliveryIntent,
} from './periodic-delivery-confirmation';
import {
  canSelectPeriodicDelivery,
  MAX_SELECTED_DELIVERIES,
} from './periodic-delivery-selection';
import { PeriodicDeliveryWorklist } from './periodic-delivery-worklist';
import { PeriodicEmailReadiness } from './periodic-email-readiness';
import {
  type PeriodicRecipientIntent,
  PeriodicRecipientRemediation,
} from './periodic-recipient-remediation';
import {
  normalizePeriodicReportPeriod,
  periodicReportFilterKeys,
  periodicReportFilters,
} from './periodic-report-filters';
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
import { PeriodicReportsToolbar } from './periodic-reports-toolbar';
import {
  PERIODIC_STAGES,
  PeriodicStatusSummary,
} from './periodic-status-summary';

export default function PeriodicReportsPanel({
  permissions,
  wsId,
  cadence: controlledCadence,
}: {
  permissions: {
    canApproveReports: boolean;
    canCheckUserAttendance: boolean;
    canCreateReports: boolean;
    canDeleteReports: boolean;
    canSendReports: boolean;
    canUpdateReports: boolean;
    canUpdateUsers?: boolean;
  };
  wsId: string;
  cadence?: PeriodicReportCadence | 'all';
}) {
  const t = useTranslations('reports-hub');
  const queryClient = useQueryClient();
  const [filters, setFilters] = useQueryStates(periodicReportFilters, {
    urlKeys: periodicReportFilterKeys,
    shallow: true,
  });
  const {
    stage: requestedStage,
    cadence: urlCadence,
    query,
    approval: approvalStatus,
    delivery: deliveryStatus,
    generation: generationStatus,
    sort: sortBy,
    direction: sortDirection,
    start: rawPeriodStart,
    end: rawPeriodEnd,
  } = filters;
  const cadence = controlledCadence ?? urlCadence;
  const stage =
    approvalStatus !== 'all' ||
    deliveryStatus !== 'all' ||
    generationStatus !== 'all'
      ? 'all'
      : requestedStage;
  const { start: periodStart, end: periodEnd } = normalizePeriodicReportPeriod(
    rawPeriodStart,
    rawPeriodEnd
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debouncedQuery] = useDebounce(query.trim(), 300);
  const actor = useWorkspaceActor();
  const [queryInstance] = useState(() => crypto.randomUUID());
  const actorLease = useRef({ actor, epoch: 0 });
  if (actorLease.current.actor !== actor)
    actorLease.current = { actor, epoch: actorLease.current.epoch + 1 };
  const actorEpoch = actorLease.current.epoch;
  const queryScope = JSON.stringify([wsId, queryInstance, actorEpoch]);
  const privateQueryKey = ['periodic-reports', wsId, queryInstance, actorEpoch];
  useEffect(
    () => () => {
      queryClient.removeQueries({
        queryKey: ['periodic-reports', wsId, queryInstance, actorEpoch],
      });
    },
    [queryClient, wsId, queryInstance, actorEpoch]
  );
  const [categoryFilter, setCategoryFilter] = useState<DeliveryCategory | null>(
    null
  );
  const scope = JSON.stringify([
    wsId,
    filters,
    cadence,
    categoryFilter,
    permissions.canSendReports,
    permissions.canUpdateUsers,
  ]);
  const scopeLease = useRef({ actor, scope, epoch: 0 });
  const scopeChanged =
    scopeLease.current.actor !== actor || scopeLease.current.scope !== scope;
  if (scopeChanged) {
    scopeLease.current = { actor, scope, epoch: scopeLease.current.epoch + 1 };
  }
  const epoch = scopeLease.current.epoch;
  const [selection, setSelection] = useState<{ epoch: number; ids: string[] }>({
    epoch,
    ids: [],
  });
  const [batchIntent, setBatchIntent] = useState<PeriodicBatchIntent | null>(
    null
  );
  const [recipientIntent, setRecipientIntent] =
    useState<PeriodicRecipientIntent | null>(null);
  const [deliveryIntent, setDeliveryIntent] =
    useState<PeriodicDeliveryIntent | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    emailPreview?: PeriodicEmailPreview | null;
    report: PeriodicReport;
  } | null>(null);
  if (scopeChanged) {
    if (deliveryIntent) setDeliveryIntent(null);
    if (previewSelection) setPreviewSelection(null);
    if (recipientIntent) setRecipientIntent(null);
    if (batchIntent) setBatchIntent(null);
    if (selection.ids.length) setSelection({ epoch, ids: [] });
  }

  const reportsQuery = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: [
      ...privateQueryKey,
      stage,
      categoryFilter,
      generationStatus,
      cadence,
      debouncedQuery,
      approvalStatus,
      deliveryStatus,
      sortBy,
      sortDirection,
      periodStart,
      periodEnd,
    ],
    enabled: Boolean(actor),
    queryFn: async ({ pageParam }) => {
      actor?.assertActive();
      if (!actor) throw new Error('Workspace account unavailable');
      const page = await listPeriodicReports(wsId, {
        stage: stage === 'all' ? undefined : stage,
        category: categoryFilter ?? undefined,
        approvalStatus: approvalStatus === 'all' ? undefined : approvalStatus,
        cadence,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        generationStatus:
          generationStatus === 'all' ? undefined : generationStatus,
        deliveryStatus: deliveryStatus === 'all' ? undefined : deliveryStatus,
        page: pageParam,
        pageSize: MAX_SELECTED_DELIVERIES,
        query: debouncedQuery || undefined,
        sortBy,
        sortDirection,
      });
      actor.assertActive();
      return { ...page, queryScope };
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 15_000,
  });
  const accessLost =
    !actor ||
    (reportsQuery.error instanceof InternalApiError &&
      [401, 403].includes(reportsQuery.error.status));
  if (accessLost) {
    if (previewSelection) setPreviewSelection(null);
    if (deliveryIntent) setDeliveryIntent(null);
    if (batchIntent) setBatchIntent(null);
    if (recipientIntent) setRecipientIntent(null);
    if (selection.ids.length) setSelection({ epoch, ids: [] });
  }
  const ownedData =
    !accessLost &&
    reportsQuery.data?.pages.every((page) => page.queryScope === queryScope)
      ? reportsQuery.data
      : undefined;
  const currentRows =
    Boolean(ownedData) &&
    !reportsQuery.isPlaceholderData &&
    !reportsQuery.isError &&
    query.trim() === debouncedQuery;
  const reports = currentRows
    ? (ownedData?.pages.flatMap((page) => page.data) ?? [])
    : [];
  const visibleReports = reports;
  const eligible =
    permissions.canSendReports && actor && currentRows
      ? visibleReports.filter(canSelectPeriodicDelivery)
      : [];
  const selected =
    selection.epoch === epoch
      ? eligible.filter((report) => selection.ids.includes(report.id))
      : [];
  const toggleSelection = (reportId: string) => {
    const ids = selected.map((report) => report.id);
    setSelection({
      epoch,
      ids: ids.includes(reportId)
        ? ids.filter((id) => id !== reportId)
        : ids.length < MAX_SELECTED_DELIVERIES
          ? [...ids, reportId]
          : ids,
    });
  };
  const counts = currentRows ? ownedData?.pages[0]?.counts : undefined;
  const categoryCounts = currentRows
    ? ownedData?.pages[0]?.categoryCounts
    : undefined;
  const totalReports = currentRows ? ownedData?.pages[0]?.total : undefined;
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
      updateWorkspaceUserApproval(wsId, {
        action: 'approve',
        kind: 'reports',
        itemId: reportId,
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
    }) => {
      if (!actor) throw new Error('Workspace account unavailable');
      actor.assertActive();
      const owner = actor;
      const ownerScope = scope;
      return requestPeriodicReportDelivery(wsId, reportId, action).then(
        (result) => {
          owner.assertActive();
          return { result, owner, ownerScope };
        }
      );
    },
    onSuccess: async ({ result, owner, ownerScope }, variables) => {
      if (
        scopeLease.current.actor !== owner ||
        scopeLease.current.scope !== ownerScope
      )
        return;
      try {
        owner.assertActive();
      } catch {
        return;
      }
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
    <div className="min-w-0 space-y-4">
      <PeriodicEmailReadiness wsId={wsId} />
      <PeriodicStatusSummary
        stage={stage}
        counts={counts}
        onChange={(stage) =>
          void setFilters({
            stage,
            approval: 'all',
            delivery: 'all',
            generation: 'all',
          })
        }
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {periodStart || periodEnd
                  ? t('period_scope', {
                      start: periodStart || t('all_time_start'),
                      end: periodEnd || t('all_time_end'),
                    })
                  : t('all_periods')}
              </p>
              <Button
                size="icon"
                className="size-8"
                variant="ghost"
                aria-label={t('refresh')}
                title={t('refresh')}
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await reportsQuery.refetch();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                <RefreshCw
                  className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>

            <PeriodicReportsToolbar
              stageChanged={stage !== 'pending'}
              stageLabel={
                stage === 'all'
                  ? undefined
                  : t(PERIODIC_STAGES.find(([key]) => key === stage)![1])
              }
              generationStatus={generationStatus}
              approvalStatus={approvalStatus}
              cadence={cadence}
              hideCadence={controlledCadence !== undefined}
              deliveryStatus={deliveryStatus}
              onApprovalStatusChange={(approval) =>
                void setFilters({ approval, stage: 'all' })
              }
              onCadenceChange={(cadence) => void setFilters({ cadence })}
              onDeliveryStatusChange={(delivery) =>
                void setFilters({ delivery, stage: 'all' })
              }
              onQueryChange={(query) => void setFilters({ query })}
              onReset={() => {
                void setFilters({
                  stage: 'pending',
                  approval: 'all',
                  delivery: 'all',
                  generation: 'all',
                  start: '',
                  end: '',
                  query: '',
                  sort: 'period',
                  direction: 'desc',
                });
              }}
              onSortChange={(nextSortBy, nextDirection) => {
                void setFilters({ sort: nextSortBy, direction: nextDirection });
              }}
              periodStart={periodStart}
              periodEnd={periodEnd}
              onPeriodChange={(start, end) => void setFilters({ start, end })}
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
          </div>
        }
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

      <PeriodicDeliveryWorklist
        reports={reports}
        total={totalReports}
        categoryCounts={categoryCounts}
        eligibleCount={eligible.length}
        selectedCount={selected.length}
        canSend={permissions.canSendReports}
        currentRows={currentRows}
        pending={deliveryMutation.isPending}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        onSelectAll={() =>
          setSelection({
            epoch,
            ids: eligible
              .slice(0, MAX_SELECTED_DELIVERIES)
              .map((report) => report.id),
          })
        }
        onClear={() => setSelection({ epoch, ids: [] })}
        onReview={() =>
          actor &&
          setBatchIntent({
            actor,
            wsId,
            epoch,
            reports: selected.map((report) => ({ ...report })),
          })
        }
      />
      {reportsQuery.isPlaceholderData && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('updating_results')}
        </p>
      )}
      {reportsQuery.isError && reports.length > 0 && (
        <p role="alert" className="text-destructive text-xs">
          {t('stale_results')}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
        {reportsQuery.isError ? (
          <Card>
            <CardContent className="flex min-h-36 flex-col items-center justify-center gap-3 p-4 text-center">
              <p>
                {t(
                  reportsQuery.error instanceof InternalApiError &&
                    reportsQuery.error.status === 422
                    ? 'narrow_scope'
                    : 'load_error'
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => void reportsQuery.refetch()}
              >
                {t('retry')}
              </Button>
            </CardContent>
          </Card>
        ) : !currentRows ? (
          <PeriodicReportsRowsLoading />
        ) : visibleReports.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="font-medium">{t('no_periodic')}</p>
              <p className="text-muted-foreground text-sm">
                {t('no_matching_reports')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCategoryFilter(null);
                  void setFilters({
                    stage: 'all',
                    approval: 'all',
                    delivery: 'all',
                    generation: 'all',
                    query: '',
                    start: '',
                    end: '',
                  });
                }}
              >
                {t('show_all_reports')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          visibleReports.map((report) => (
            <PeriodicReportRow
              key={report.id}
              report={report}
              wsId={wsId}
              permissions={permissions}
              selectable={eligible.some(
                (candidate) => candidate.id === report.id
              )}
              selected={selected.some(
                (candidate) => candidate.id === report.id
              )}
              onToggleSelection={() => toggleSelection(report.id)}
              onEditRecipient={() =>
                actor &&
                setRecipientIntent({
                  actor,
                  wsId,
                  userId: report.user_id,
                  epoch,
                })
              }
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
                actor && setDeliveryIntent({ action, report, wsId, actor })
              }
            />
          ))
        )}
      </div>

      {reportsQuery.isFetchingNextPage ? (
        <PeriodicReportsRowsLoading />
      ) : currentRows && reportsQuery.hasNextPage ? (
        <Button
          className="w-full"
          variant="outline"
          onClick={() => void reportsQuery.fetchNextPage()}
        >
          {t('load_more')}
        </Button>
      ) : null}
      {reports.length > 0 && totalReports !== undefined ? (
        <p className="text-center text-muted-foreground text-xs">
          {t('showing_periodic', {
            loaded: numberFormatter.format(reports.length),
            total: numberFormatter.format(totalReports),
          })}
        </p>
      ) : null}

      <PeriodicRecipientRemediation
        intent={recipientIntent}
        wsId={wsId}
        epoch={epoch}
        canUpdateUsers={Boolean(permissions.canUpdateUsers)}
        onClose={() => setRecipientIntent(null)}
        onSaved={() => {
          setRecipientIntent(null);
          void invalidate();
        }}
      />
      <PeriodicDeliveryBatchDialog
        intent={batchIntent}
        reports={currentRows ? reports : []}
        wsId={wsId}
        epoch={epoch}
        canSend={permissions.canSendReports && currentRows}
        onClose={() => {
          setBatchIntent(null);
          setSelection({ epoch, ids: [] });
        }}
        onQueued={() => {
          setSelection({ epoch, ids: [] });
          void invalidate();
        }}
      />
      <PeriodicDeliveryConfirmation
        intent={deliveryIntent}
        wsId={wsId}
        canSend={permissions.canSendReports && currentRows}
        isPending={deliveryMutation.isPending}
        onCancel={() => setDeliveryIntent(null)}
        onConfirm={() => {
          if (deliveryIntent && currentRows) {
            actor?.assertActive();
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
