'use client';

import {
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClockIcon,
  FilterIcon,
  Loader2,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useApprovals } from '../hooks/use-approvals';
import { getStatusColorClasses, STATUS_LABELS } from '../utils';
import { ApprovalDetailDialog } from './approval-detail-dialog';

interface ApprovalsViewProps {
  wsId: string;
  kind: 'reports' | 'posts';
  canApprove: boolean;
}

export function ApprovalsView({ wsId, kind, canApprove }: ApprovalsViewProps) {
  const t = useTranslations('approvals');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Memoize URL params
  const { currentStatus, currentPage, currentLimit } = useMemo(() => {
    const rawStatus =
      (searchParams.get('status') as
        | 'all'
        | 'pending'
        | 'approved'
        | 'rejected') || 'pending';
    const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const safePage = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const rawLimit = Number.parseInt(searchParams.get('limit') || '10', 10);
    const safeLimit = Number.isNaN(rawLimit) || rawLimit < 1 ? 10 : rawLimit;
    return {
      currentStatus: rawStatus,
      currentPage: safePage,
      currentLimit: safeLimit,
    };
  }, [searchParams]);

  const {
    items,
    totalCount,
    totalPages,
    loading,
    isError,
    error,
    approveItem,
    approveAllItems,
    rejectItem,
    isApproving,
    isApprovingAll,
    approveAllProgress,
    isRejecting,
    formatDate,
    getStatusLabel,
    detailItem,
    setDetailItem,
    closeDetailDialog,
    totalPendingCount,
  } = useApprovals({
    wsId,
    kind,
    status: currentStatus,
    page: currentPage,
    limit: currentLimit,
  });

  const hasActiveFilters = useMemo(() => {
    return currentStatus && currentStatus !== 'pending';
  }, [currentStatus]);

  const { startIndex, endIndex } = useMemo(
    () => ({
      startIndex: totalCount > 0 ? (currentPage - 1) * currentLimit + 1 : 0,
      endIndex: Math.min(currentPage * currentLimit, totalCount),
    }),
    [currentPage, currentLimit, totalCount]
  );

  const updateFilters = (key: 'status', value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set('page', '1');
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const updatePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const updateLimit = (newLimit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', newLimit.toString());
    params.set('page', '1');
    router.push(`?${params.toString()}`, { scroll: false });
  };

  if (isError) {
    return (
      <Card className="border-dynamic-red/20 bg-dynamic-red/5">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <XCircleIcon className="h-8 w-8 text-dynamic-red" />
          <p className="mt-4 font-semibold text-dynamic-red">
            {t('list.error')}
          </p>
          <p className="mt-2 text-center text-muted-foreground text-sm">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10 shadow-sm transition-shadow hover:shadow-md">
        <CardHeader className="border-border/50 border-b bg-linear-to-b from-background/95 to-background/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/10">
              <FilterIcon className="h-4 w-4 text-dynamic-blue" />
            </div>
            <div>
              <CardTitle className="text-base leading-none tracking-tight md:text-lg">
                {t('filters.title')}
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                {t('filters.description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="status-filter"
                className="font-medium text-sm leading-none"
              >
                {t('filters.status')}
              </label>
              <Select
                value={currentStatus || 'pending'}
                onValueChange={(value) =>
                  updateFilters(
                    'status',
                    value === 'pending' ? undefined : value
                  )
                }
              >
                <SelectTrigger
                  id="status-filter"
                  className="border-border/60 hover:bg-accent/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value]) => (
                    <SelectItem key={value} value={value}>
                      {t(
                        `filters.status_${value as keyof typeof STATUS_LABELS}`
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('status', 'pending');
                  router.push(`?${params.toString()}`, { scroll: false });
                }}
                className="h-8 gap-1.5 text-xs"
              >
                <XIcon className="h-3 w-3" />
                {t('filters.clearFilters')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold text-xl">
            {kind === 'reports' ? t('tabs.reports') : t('tabs.posts')}
          </h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {t('list.showing', {
                start: startIndex,
                end: endIndex,
                total: totalCount,
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {canApprove && totalPendingCount > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => approveAllItems()}
              disabled={isApprovingAll}
              className="h-9 gap-2 bg-dynamic-green hover:bg-dynamic-green/90"
            >
              {isApprovingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {approveAllProgress
                    ? t('actions.approveAllProgress', {
                        current: approveAllProgress.current,
                        total: approveAllProgress.total,
                      })
                    : t('actions.approveAll', { count: totalPendingCount })}
                </>
              ) : (
                <>
                  <CheckCheckIcon className="h-4 w-4" />
                  {t('actions.approveAll', { count: totalPendingCount })}
                </>
              )}
            </Button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {t('list.itemsPerPage')}:
            </span>
            <Select
              value={currentLimit.toString()}
              onValueChange={(value) => updateLimit(Number.parseInt(value, 10))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 25, 50, 100].map((limit) => (
                  <SelectItem key={limit} value={limit.toString()}>
                    {limit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Approvals List */}
      {loading ? (
        <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-dynamic-blue" />
            <p className="mt-4 text-muted-foreground text-sm">
              {t('list.loading')}
            </p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dynamic-blue/10 ring-1 ring-dynamic-blue/20">
              <ClockIcon className="h-8 w-8 text-dynamic-blue" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground text-lg">
              {t('list.noItemsTitle')}
            </h3>
            <p className="mt-2 text-center text-muted-foreground text-sm">
              {hasActiveFilters
                ? t('list.noItemsMessage')
                : t('list.noItemsDefault')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4">
          {items.map((item) => {
            const status =
              item.kind === 'reports'
                ? item.report_approval_status
                : item.post_approval_status;
            const rejectionReason = item.rejection_reason;
            const approvedAt = item.approved_at;
            const rejectedAt = item.rejected_at;
            const title = item.title || t('labels.untitled');
            const modifierName = item.modifier_name || t('labels.unknown_user');

            return (
              <Card
                key={item.id}
                className="border-border/60 bg-linear-to-br from-background to-muted/5 shadow-sm transition-all hover:cursor-pointer hover:shadow-md hover:ring-2 hover:ring-dynamic-blue/20"
                onClick={() => setDetailItem(item)}
              >
                <CardContent className="p-4 md:p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm">{title}</div>
                        <div className="text-muted-foreground text-xs">
                          {item.kind === 'reports' && (
                            <span>
                              {item.user_name || t('labels.unknown_user')}
                            </span>
                          )}
                          {item.kind === 'reports' && <span> • </span>}
                          <span>
                            {item.group_name || t('labels.unknown_group')}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs ${getStatusColorClasses(
                          status
                        )}`}
                      >
                        {getStatusLabel(status)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                      <span>
                        {t('labels.created_at')} {formatDate(item.created_at)}
                      </span>
                      <span>
                        {t('labels.last_modified_by')} {modifierName}
                      </span>
                      {approvedAt && (
                        <span>
                          {t('labels.approved_at')} {formatDate(approvedAt)}
                        </span>
                      )}
                      {rejectedAt && (
                        <span>
                          {t('labels.rejected_at')} {formatDate(rejectedAt)}
                        </span>
                      )}
                    </div>

                    {rejectionReason && status === 'REJECTED' && (
                      <div className="rounded-md border border-dynamic-red/20 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
                        {t('labels.rejection_reason')}: {rejectionReason}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Card className="border-border/60 bg-linear-to-br from-muted/20 to-muted/5 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 md:flex-nowrap md:p-5">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
              >
                <ChevronsLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-1 items-center justify-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                )
                .map((page, index, array) => (
                  <div key={page} className="flex items-center">
                    {index > 0 && page - array[index - 1]! > 1 && (
                      <span className="px-2 text-muted-foreground text-sm">
                        …
                      </span>
                    )}
                    <Button
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updatePage(page)}
                      className={cn(
                        'h-8 min-w-10 text-sm transition-all',
                        currentPage === page
                          ? 'bg-dynamic-blue text-white shadow-sm hover:bg-dynamic-blue/90'
                          : 'hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5'
                      )}
                    >
                      {page}
                    </Button>
                  </div>
                ))}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
              >
                <ChevronsRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ApprovalDetailDialog
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => {
          if (!open) closeDetailDialog();
        }}
        formatDate={formatDate}
        canApprove={canApprove}
        onApprove={approveItem}
        onReject={rejectItem}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    </div>
  );
}
