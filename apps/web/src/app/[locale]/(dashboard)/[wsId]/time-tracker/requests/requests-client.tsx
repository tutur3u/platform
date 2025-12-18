'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClockIcon,
  FilterIcon,
  Loader2,
  Paperclip,
  UserIcon,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
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
import { format } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { useAvailableUsers, useRequests } from './hooks/use-requests';
import type { ExtendedTimeTrackingRequest } from './page';
import { RequestDetailModal } from './request-detail-modal';
import { ThresholdSettingsDialog } from './threshold-settings-dialog';

interface RequestsClientProps {
  wsId: string;
  bypassRulesPermission: boolean;
  currentUser: WorkspaceUser | null;
}

const STATUS_LABELS: Record<
  'pending' | 'approved' | 'rejected' | 'all',
  string
> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20',
  APPROVED: 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20',
  REJECTED: 'bg-dynamic-red/10 text-dynamic-red border-dynamic-red/20',
};

export function RequestsClient({
  wsId,
  bypassRulesPermission,
  currentUser,
}: RequestsClientProps) {
  const t = useTranslations('time-tracker.requests');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] =
    useState<ExtendedTimeTrackingRequest | null>(null);

  // Memoize URL params to prevent unnecessary re-renders
  const { currentStatus, currentUserId, currentPage, currentLimit } =
    useMemo(() => {
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
        currentUserId: searchParams.get('userId') || undefined,
        currentPage: safePage,
        currentLimit: safeLimit,
      };
    }, [searchParams]);

  // Fetch data using React Query with server-provided initialData
  const {
    data: requestsData,
    isLoading,
    isError,
    error,
  } = useRequests({
    wsId,
    status: currentStatus,
    userId: currentUserId,
    page: currentPage,
    limit: currentLimit,
    // initialData: stableInitialData,
  });

  const { data: availableUsersData = [], isLoading: usersLoading } =
    useAvailableUsers({
      wsId,
      // initialData: initialAvailableUsers,
    });

  const { data: thresholdData, isLoading: thresholdLoading } =
    useWorkspaceTimeThreshold(wsId);

  const requests = requestsData?.requests || [];
  const totalCount = requestsData?.totalCount || 0;
  const totalPages = requestsData?.totalPages || 0;

  const hasActiveFilters = useMemo(
    () => (currentStatus && currentStatus !== 'pending') || !!currentUserId,
    [currentStatus, currentUserId]
  );

  const { startIndex, endIndex } = useMemo(
    () => ({
      startIndex: totalCount > 0 ? (currentPage - 1) * currentLimit + 1 : 0,
      endIndex: Math.min(currentPage * currentLimit, totalCount),
    }),
    [currentPage, currentLimit, totalCount]
  );

  const updateFilters = (
    key: 'status' | 'userId',
    value: string | undefined
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when filters change
    params.set('page', '1');

    router.push(`?${params.toString()}`);
  };

  const updatePage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', page.toString());
    router.push(`?${params.toString()}`);
  };

  const updateLimit = (newLimit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', newLimit.toString());
    params.set('page', '1'); // Reset to first page
    router.push(`?${params.toString()}`);
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleThresholdUpdate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['workspace-time-threshold', wsId],
    });
  }, [queryClient, wsId]);

  return (
    <>
      <div className="space-y-4">
        {/* Error State */}
        {isError && (
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
        )}

        {!isError && (
          <>
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
                  {/* Status Filter */}
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
                            {t(`status.${value as keyof typeof STATUS_LABELS}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* User Filter */}
                  <div className="space-y-2">
                    <label
                      htmlFor="user-filter"
                      className="font-medium text-sm leading-none"
                    >
                      {t('filters.user')}
                    </label>
                    <Select
                      value={currentUserId || 'all'}
                      onValueChange={(value) =>
                        updateFilters(
                          'userId',
                          value === 'all' ? undefined : value
                        )
                      }
                    >
                      <SelectTrigger
                        id="user-filter"
                        className="border-border/60 hover:bg-accent/50"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t('filters.allUsers')}
                        </SelectItem>
                        {usersLoading ? (
                          <div className="px-2 py-1.5 text-muted-foreground text-sm">
                            Loading users...
                          </div>
                        ) : (
                          availableUsersData.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.display_name}
                            </SelectItem>
                          ))
                        )}
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
                        router.push(`?${params.toString()}`);
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
                <h2 className="font-semibold text-xl">{t('list.title')}</h2>
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

              <div className="flex items-center gap-2">
                {thresholdLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ThresholdSettingsDialog
                    wsId={wsId}
                    currentThreshold={thresholdData?.threshold}
                    currentPauseExempt={thresholdData?.pauseExempt}
                    currentResumeThreshold={thresholdData?.resumeThresholdMinutes}
                    onUpdate={handleThresholdUpdate}
                  />
                )}
                <span className="text-muted-foreground text-sm">
                  {t('list.itemsPerPage')}:
                </span>
                <Select
                  value={currentLimit.toString()}
                  onValueChange={(value) =>
                    updateLimit(Number.parseInt(value, 10))
                  }
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Requests List */}
            {isLoading ? (
              <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-dynamic-blue" />
                  <p className="mt-4 text-muted-foreground text-sm">
                    {t('list.loading')}
                  </p>
                </CardContent>
              </Card>
            ) : requests.length === 0 ? (
              <Card className="border-border/60 bg-linear-to-br from-muted/30 to-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dynamic-blue/10 ring-1 ring-dynamic-blue/20">
                    <ClockIcon className="h-8 w-8 text-dynamic-blue" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground text-lg">
                    {t('list.noRequestsTitle')}
                  </h3>
                  <p className="mt-2 text-center text-muted-foreground text-sm">
                    {hasActiveFilters
                      ? t('list.noRequestsMessage')
                      : t('list.noRequestsDefault')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:gap-4">
                {requests.map((request) => (
                  <Card
                    key={request.id}
                    className="group cursor-pointer border-border/60 bg-linear-to-br from-background to-muted/5 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-dynamic-blue/20"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'border font-medium text-xs',
                                STATUS_COLORS[request.approval_status]
                              )}
                            >
                              {request.approval_status === 'PENDING' &&
                                t('status.pending')}
                              {request.approval_status === 'APPROVED' &&
                                t('status.approved')}
                              {request.approval_status === 'REJECTED' &&
                                t('status.rejected')}
                            </Badge>
                            {request.category && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple"
                              >
                                {request.category.name}
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {calculateDuration(
                              request.start_time,
                              request.end_time
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="font-semibold text-foreground text-lg tracking-tight group-hover:text-dynamic-blue">
                            {request.title}
                          </h3>
                          {request.description && (
                            <p className="line-clamp-2 text-muted-foreground text-sm leading-relaxed">
                              {request.description}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
                          <div className="flex items-center gap-2">
                            {request.user ? (
                              <>
                                <Avatar className="h-5 w-5 ring-1 ring-border/50">
                                  <AvatarImage
                                    src={request.user.avatar_url || ''}
                                  />
                                  <AvatarFallback className="bg-dynamic-blue/10 font-semibold text-[10px] text-dynamic-blue">
                                    {request.user.display_name?.[0] ||
                                      request.user.user_private_details
                                        .email?.[0] ||
                                      'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">
                                  {request.user.display_name ||
                                    request.user.user_private_details.email ||
                                    'Unknown User'}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted ring-1 ring-border/50">
                                  <UserIcon className="h-3 w-3" />
                                </div>
                                <span className="font-medium">
                                  Unknown User
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            <span>
                              {format(
                                new Date(request.start_time),
                                'MMM d, yyyy h:mm a'
                              )}
                            </span>
                          </div>

                          {request.task && (
                            <Badge
                              variant="outline"
                              className="border-border/60 bg-background/50 text-[10px]"
                            >
                              Task: {request.task.name}
                            </Badge>
                          )}

                          {request.images && request.images.length > 0 && (
                            <Badge
                              variant="outline"
                              className="border-border/60 bg-background/50 text-[10px]"
                            >
                              <Paperclip className="mr-1 h-3 w-3" />{' '}
                              {request.images.length} image
                              {request.images.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>

                        {/* Show approval/rejection info */}
                        {request.approval_status === 'APPROVED' &&
                          request.approved_by_user && (
                            <div className="flex items-center gap-2 rounded-md bg-dynamic-green/5 px-3 py-2 text-xs">
                              <CheckCircle2Icon className="h-4 w-4 text-dynamic-green" />
                              <span className="text-muted-foreground">
                                {t('list.approvedBy', {
                                  name: request.approved_by_user.display_name,
                                })}
                                {request.approved_at &&
                                  ` ${t('list.approvedOn', {
                                    date: format(
                                      new Date(request.approved_at),
                                      'MMM d, yyyy'
                                    ),
                                  })}`}
                              </span>
                            </div>
                          )}

                        {request.approval_status === 'REJECTED' &&
                          request.rejected_by_user && (
                            <div className="flex items-center gap-2 rounded-md bg-dynamic-red/5 px-3 py-2 text-xs">
                              <XCircleIcon className="h-4 w-4 text-dynamic-red" />
                              <span className="text-muted-foreground">
                                {t('list.rejectedBy', {
                                  name: request.rejected_by_user.display_name,
                                })}
                                {request.rejected_at &&
                                  ` ${t('list.rejectedOn', {
                                    date: format(
                                      new Date(request.rejected_at),
                                      'MMM d, yyyy'
                                    ),
                                  })}`}
                              </span>
                            </div>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <Card className="border-border/60 bg-linear-to-br from-muted/20 to-muted/5 shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 md:flex-nowrap md:p-5">
                  {/* First/Previous buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updatePage(1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
                      title="First page"
                    >
                      <ChevronsLeftIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updatePage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
                      title="Previous page"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Page numbers */}
                  <div className="flex flex-1 items-center justify-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, array) => {
                        const showEllipsisBefore =
                          index > 0 && page - array[index - 1]! > 1;

                        return (
                          <div key={page} className="flex items-center">
                            {showEllipsisBefore && (
                              <span className="px-2 text-muted-foreground text-sm">
                                …
                              </span>
                            )}
                            <Button
                              variant={
                                currentPage === page ? 'default' : 'outline'
                              }
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
                        );
                      })}
                  </div>

                  {/* Next/Last buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updatePage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
                      title="Next page"
                    >
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updatePage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0 transition-all hover:border-dynamic-blue/50 hover:bg-dynamic-blue/5 disabled:opacity-40"
                      title="Last page"
                    >
                      <ChevronsRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onUpdate={() => {
            setSelectedRequest(null);
          }}
          wsId={wsId}
          bypassRulesPermission={bypassRulesPermission}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
