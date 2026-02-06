'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceTimeThreshold } from '@tuturuuu/hooks';
import {
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClockIcon,
  FilterIcon,
  InfoIcon,
  Loader2,
  Paperclip,
  UserIcon,
  XCircleIcon,
  XIcon,
} from '@tuturuuu/icons';
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
import { useCallback, useMemo } from 'react';
import { useAvailableUsers, useRequests } from '../hooks/use-requests';
import { ThresholdSettingsDialog } from '../threshold-settings-dialog';
import type { RequestsViewProps } from '../utils';
import {
  calculateDuration,
  getCategoryColorClasses,
  getStatusColorClasses,
  STATUS_LABELS,
} from '../utils';

type ViewMode = 'all' | 'my';

interface ConsolidatedRequestsViewProps extends RequestsViewProps {
  /**
   * 'all' - Shows all requests with user filter (for admins/managers)
   * 'my' - Shows only current user's requests (no user filter)
   */
  viewMode: ViewMode;
}

export function RequestsView({
  wsId,
  currentUser,
  onSelectRequest,
  viewMode,
}: ConsolidatedRequestsViewProps) {
  const t = useTranslations('time-tracker.requests');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const isAllMode = viewMode === 'all';

  // Memoize URL params
  const { currentStatus, currentUserId, currentPage, currentLimit } =
    useMemo(() => {
      const rawStatus =
        (searchParams.get('status') as
          | 'all'
          | 'pending'
          | 'approved'
          | 'rejected'
          | 'needs_info') || 'pending';
      const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
      const safePage = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      const rawLimit = Number.parseInt(searchParams.get('limit') || '10', 10);
      const safeLimit = Number.isNaN(rawLimit) || rawLimit < 1 ? 10 : rawLimit;
      return {
        currentStatus: rawStatus,
        // Only read userId from URL in 'all' mode
        currentUserId: isAllMode
          ? searchParams.get('userId') || undefined
          : undefined,
        currentPage: safePage,
        currentLimit: safeLimit,
      };
    }, [searchParams, isAllMode]);

  // Determine userId for the hook:
  // - In 'my' mode: always use currentUser's id
  // - In 'all' mode: use the URL filter (if any)
  const hookUserId = isAllMode ? currentUserId : currentUser?.id;

  const {
    data: requestsData,
    isLoading,
    isError,
    error,
  } = useRequests({
    wsId,
    status: currentStatus,
    userId: hookUserId,
    page: currentPage,
    limit: currentLimit,
  });

  // Only fetch available users in 'all' mode
  const { data: availableUsersData = [], isLoading: usersLoading } =
    useAvailableUsers({ wsId, enabled: isAllMode });

  // Only fetch threshold data in 'all' mode
  const { data: thresholdData, isLoading: thresholdLoading } =
    useWorkspaceTimeThreshold(wsId, { enabled: isAllMode });

  const requests = requestsData?.requests || [];
  const totalCount = requestsData?.totalCount || 0;
  const totalPages = requestsData?.totalPages || 0;

  const hasActiveFilters = useMemo(() => {
    if (isAllMode) {
      return (currentStatus && currentStatus !== 'pending') || !!currentUserId;
    }
    return currentStatus && currentStatus !== 'pending';
  }, [currentStatus, currentUserId, isAllMode]);

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
    if (value) params.set(key, value);
    else params.delete(key);
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
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleThresholdUpdate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['workspace-time-threshold', wsId],
    });
  }, [queryClient, wsId]);

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
                      {t(`status.${value as keyof typeof STATUS_LABELS}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User filter - only shown in 'all' mode */}
            {isAllMode && (
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
                    updateFilters('userId', value === 'all' ? undefined : value)
                  }
                >
                  <SelectTrigger
                    id="user-filter"
                    className="border-border/60 hover:bg-accent/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.allUsers')}</SelectItem>
                    {usersLoading ? (
                      <div className="px-2 py-1.5 text-muted-foreground text-sm">
                        {t('filters.loadingUsers')}
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
            )}
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
          {/* Threshold settings - only shown in 'all' mode */}
          {isAllMode &&
            (thresholdLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ThresholdSettingsDialog
                wsId={wsId}
                currentThreshold={thresholdData?.threshold}
                onUpdate={handleThresholdUpdate}
              />
            ))}
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
              onClick={() => onSelectRequest(request)}
            >
              <CardContent className="p-4 md:p-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border font-medium text-xs',
                          getStatusColorClasses(request.approval_status)
                        )}
                      >
                        {t(
                          `status.${request.approval_status.toLowerCase() as keyof typeof STATUS_LABELS}`
                        )}
                      </Badge>
                      {request.category && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'border font-medium text-xs',
                            getCategoryColorClasses(request.category.color)
                          )}
                        >
                          {request.category.name}
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {calculateDuration(request.start_time, request.end_time)}
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
                            <AvatarImage src={request.user.avatar_url || ''} />
                            <AvatarFallback className="bg-dynamic-blue/10 font-semibold text-[10px] text-dynamic-blue">
                              {request.user.display_name?.[0] ||
                                request.user.user_private_details.email?.[0] ||
                                'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {request.user.display_name ||
                              request.user.user_private_details.email ||
                              t('detail.unknownUser')}
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted ring-1 ring-border/50">
                            <UserIcon className="h-3 w-3" />
                          </div>
                          <span className="font-medium">
                            {t('detail.unknownUser')}
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
                        {t('list.task', { name: request.task.name })}
                      </Badge>
                    )}

                    {request.images && request.images.length > 0 && (
                      <Badge
                        variant="outline"
                        className="border-border/60 bg-background/50 text-[10px]"
                      >
                        <Paperclip className="mr-1 h-3 w-3" />{' '}
                        {t('list.attachments', {
                          count: request.images.length,
                        })}
                      </Badge>
                    )}
                  </div>

                  {request.approval_status === 'APPROVED' &&
                    request.approved_by_user && (
                      <div className="flex items-center gap-2 rounded-md bg-dynamic-green/5 px-3 py-2 text-xs">
                        <CheckCircle2Icon className="h-4 w-4 text-dynamic-green" />
                        <span className="text-muted-foreground">
                          {t('list.approvedBy', {
                            name: request.approved_by_user.display_name,
                          })}
                          {request.approved_at &&
                            ` ${t('list.approvedOn', { date: format(new Date(request.approved_at), 'MMM d, yyyy') })}`}
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
                            ` ${t('list.rejectedOn', { date: format(new Date(request.rejected_at), 'MMM d, yyyy') })}`}
                        </span>
                      </div>
                    )}

                  {request.approval_status === 'NEEDS_INFO' &&
                    request.needs_info_requested_by_user && (
                      <div className="flex items-center gap-2 rounded-md bg-dynamic-blue/5 px-3 py-2 text-xs">
                        <InfoIcon className="h-4 w-4 text-dynamic-blue" />
                        <span className="text-muted-foreground">
                          {t('list.needsInfoBy', {
                            name: request.needs_info_requested_by_user
                              .display_name,
                          })}
                          {request.needs_info_requested_at &&
                            ` ${t('list.needsInfoOn', { date: format(new Date(request.needs_info_requested_at), 'MMM d, yyyy') })}`}
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
    </div>
  );
}
