'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Clock,
  History,
  Loader2,
  PartyPopper,
  Plus,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { formatDuration } from '@/lib/time-format';
import type { PeriodStats } from '@/lib/time-tracker-utils';
import type { SessionWithRelations } from '../../types';
import MissedEntryDialog from '../missed-entry-dialog';
import { WorkspaceSelectDialog } from '../workspace-select-dialog';
import { EditSessionDialog } from './edit-session-dialog';
import { MonthView } from './month-view';
import { PendingRequestsBanner } from './pending-requests-banner';
import { PeriodNavigation } from './period-navigation';
import { SessionFilters } from './session-filters';
import { SessionStats } from './session-stats';
import type {
  FilterState,
  SessionHistoryProps,
  ViewMode,
} from './session-types';
import {
  sessionOverlapsPeriod,
  sortSessionGroups,
  stackSessions,
} from './session-utils';
import { StackedSessionItem } from './stacked-session-item';
import { useSessionActions } from './use-session-actions';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const PAGINATION_LIMIT = 5;

export function SessionHistory({
  wsId,
  userId,
  categories,
  workspace,
  isPersonal,
  currentUser,
  canManageTimeTrackingRequests,
  canBypassTimeTrackingRequestApproval,
}: Omit<SessionHistoryProps, 'tasks'>) {
  const t = useTranslations('time-tracker.session_history');
  const { data: thresholdData, isLoading: isLoadingThreshold } =
    useWorkspaceTimeThreshold(wsId);

  // View state - moved before query so it can be used in query key
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(dayjs());

  const userTimezone = dayjs.tz.guess();

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    categoryId: 'all',
    duration: 'all',
    timeOfDay: 'all',
    projectContext: 'all',
  });

  // Calculate period bounds for API query
  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const view = viewMode === 'week' ? 'isoWeek' : viewMode;
    const start = currentDate.tz(userTimezone).startOf(view);
    const end = currentDate.tz(userTimezone).endOf(view);
    return { startOfPeriod: start, endOfPeriod: end };
  }, [currentDate, viewMode, userTimezone]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch sessions for the current period with infinite query
  const {
    data: sessionsInfiniteData,
    isLoading: isLoadingSessions,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{
    sessions: SessionWithRelations[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  }>({
    queryKey: [
      'time-tracking-sessions',
      wsId,
      userId,
      'history',
      startOfPeriod.toISOString(),
      endOfPeriod.toISOString(),
      filters,
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        type: 'history',
        limit: PAGINATION_LIMIT.toString(),
        dateFrom: startOfPeriod.toISOString(),
        dateTo: endOfPeriod.toISOString(),
        userId: userId,
        timezone: userTimezone,
        searchQuery: filters.searchQuery,
        categoryId: filters.categoryId,
        duration: filters.duration,
        timeOfDay: filters.timeOfDay,
        projectContext: filters.projectContext,
      });
      if (pageParam) {
        params.set('cursor', pageParam as string);
      }
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?${params}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      return response.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      return lastPage.nextCursor;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Extract sessions from response
  const sessions = useMemo(
    () => sessionsInfiniteData?.pages.flatMap((page) => page.sessions) ?? [],
    [sessionsInfiniteData]
  );

  // Fetch period stats independently of paginated sessions
  const {
    data: fetchedPeriodStats,
    isLoading: isLoadingStats,
    isFetching: isFetchingStats,
  } = useQuery<PeriodStats>({
    queryKey: [
      'time-tracking-sessions',
      wsId,
      userId,
      'period-stats',
      startOfPeriod.toISOString(),
      endOfPeriod.toISOString(),
      filters,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: startOfPeriod.toISOString(),
        dateTo: endOfPeriod.toISOString(),
        timezone: userTimezone,
        userId: userId,
        searchQuery: filters.searchQuery,
        categoryId: filters.categoryId,
        duration: filters.duration,
        timeOfDay: filters.timeOfDay,
        projectContext: filters.projectContext,
      });
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/stats/period?${params}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch period stats');
      }
      return response.json();
    },
    staleTime: 30 * 1000,
  });

  // Intersection Observer for auto-loading
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Session actions hook
  const {
    actionStates,
    isDeleting,
    isEditing,
    isMoving,
    sessionToDelete,
    sessionToEdit,
    sessionToMove,
    editFormState,
    showMissedEntryDialog,
    prefillStartTime,
    prefillEndTime,
    resumeSession,
    showResumeConfirmation,
    setShowResumeConfirmation,
    pendingResumeSession,
    openEditDialog,
    closeEditDialog,
    saveEdit,
    setSessionToDelete,
    deleteSession,
    openMoveDialog,
    handleMoveSession,
    closeMoveDialog,
    openMissedEntryDialog,
    setShowMissedEntryDialog,
    setEditFormState,
  } = useSessionActions({ wsId });

  // Filter handlers
  const handleFilterChange = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      categoryId: 'all',
      duration: 'all',
      timeOfDay: 'all',
      projectContext: 'all',
    });
  }, []);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    setCurrentDate(currentDate.subtract(1, viewMode));
  }, [currentDate, viewMode]);

  const goToNext = useCallback(() => {
    setCurrentDate(currentDate.add(1, viewMode));
  }, [currentDate, viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(dayjs());
  }, []);

  // Note: startOfPeriod and endOfPeriod are already calculated at the top for the query

  const sessionsForPeriod = useMemo(
    () =>
      sessions?.filter((session) =>
        sessionOverlapsPeriod(session, startOfPeriod, endOfPeriod, userTimezone)
      ),
    [sessions, startOfPeriod, endOfPeriod, userTimezone]
  );

  const isPeriodStatsReady = Boolean(fetchedPeriodStats);
  const isPeriodStatsLoading =
    !isPeriodStatsReady && (isLoadingStats || isFetchingStats);

  const periodStats = useMemo(
    () => (isPeriodStatsReady ? fetchedPeriodStats : undefined),
    [isPeriodStatsReady, fetchedPeriodStats]
  );

  const groupedStackedSessions = useMemo(() => {
    const groups: { [key: string]: ReturnType<typeof stackSessions> } = {};

    const stackedSessions = stackSessions(
      sessionsForPeriod,
      viewMode,
      startOfPeriod,
      endOfPeriod
    );

    stackedSessions
      .sort((a, b) => dayjs(b.firstStartTime).diff(dayjs(a.firstStartTime)))
      .forEach((stackedSession) => {
        const dateToUse = stackedSession.displayDate
          ? dayjs.tz(stackedSession.displayDate, userTimezone)
          : dayjs.utc(stackedSession.firstStartTime).tz(userTimezone);

        let key = '';

        if (viewMode === 'day') {
          key = 'Sessions';
        } else if (viewMode === 'week') {
          key = dateToUse.format('dddd, MMMM D, YYYY');
        } else if (viewMode === 'month') {
          const weekStart = dateToUse.startOf('isoWeek');
          const weekEnd = dateToUse.endOf('isoWeek');
          key = `Week ${weekStart.format('MMM D')} - ${weekEnd.format('MMM D')}`;
        }
        if (!groups[key]) groups[key] = [];
        groups[key]?.push(stackedSession);
      });
    return groups;
  }, [sessionsForPeriod, viewMode, userTimezone, startOfPeriod, endOfPeriod]);

  return (
    <>
      {!isPersonal && currentUser && (
        <div className="mb-4">
          <PendingRequestsBanner
            wsId={wsId}
            currentUser={currentUser}
            canManageTimeTrackingRequests={
              canManageTimeTrackingRequests ?? false
            }
            canBypassTimeTrackingRequestApproval={
              canBypassTimeTrackingRequestApproval ?? false
            }
          />
        </div>
      )}

      <Card className="shadow-sm">
        <CardHeader className="gap-4 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                <History className="h-5 w-5 text-dynamic-orange md:h-6 md:w-6" />
              </div>
              <div>
                <div className="font-bold tracking-tight">{t('title')}</div>
                {isPeriodStatsReady && (periodStats?.sessionCount || 0) > 0 && (
                  <div className="font-normal text-muted-foreground text-xs md:text-sm">
                    {periodStats?.sessionCount === 1
                      ? t('sessions_count', {
                          count: periodStats?.sessionCount || 0,
                        })
                      : t('sessions_count_plural', {
                          count: periodStats?.sessionCount || 0,
                        })}
                  </div>
                )}
              </div>
            </CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={openMissedEntryDialog} size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t('add_missed_entry')}
                </span>
                <span className="sm:hidden">{t('add_entry')}</span>
              </Button>

              <SessionFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                categories={categories}
                filteredSessions={sessions}
                showAdvancedFilters={showAdvancedFilters}
                onToggleAdvancedFilters={() =>
                  setShowAdvancedFilters(!showAdvancedFilters)
                }
              />
            </div>
          </div>

          <PeriodNavigation
            viewMode={viewMode}
            currentDate={currentDate}
            onViewModeChange={setViewMode}
            onPrevious={goToPrevious}
            onNext={goToNext}
            onToday={goToToday}
          />
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          {isLoadingSessions ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-16">
              <Loader2 className="h-10 w-10 animate-spin text-dynamic-orange md:h-12 md:w-12" />
              <p className="mt-4 text-muted-foreground text-sm">
                {t('loading_sessions')}
              </p>
            </div>
          ) : sessionsForPeriod?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-16">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-orange/10 to-dynamic-orange/5 ring-1 ring-dynamic-orange/20 md:h-24 md:w-24">
                <Clock className="h-10 w-10 text-dynamic-orange md:h-12 md:w-12" />
              </div>
              <h3 className="font-semibold text-foreground text-lg md:text-xl">
                {t('no_sessions_for_period', {
                  period: t(viewMode as 'day' | 'week' | 'month'),
                })}
              </h3>
              <p className="mt-2 max-w-md text-center text-muted-foreground text-sm leading-relaxed md:text-base">
                {sessions?.length === 0
                  ? t('start_tracking_message')
                  : t('try_different_period')}
              </p>
              {sessions?.length === 0 && (
                <Button
                  onClick={openMissedEntryDialog}
                  className="mt-6 bg-dynamic-orange text-white hover:bg-dynamic-orange/90"
                >
                  <Plus className="h-4 w-4" />
                  {t('add_first_entry')}
                </Button>
              )}
            </div>
          ) : viewMode === 'month' ? (
            <MonthView
              periodStats={periodStats}
              isLoadingStats={isPeriodStatsLoading}
              groupedStackedSessions={groupedStackedSessions}
              startOfPeriod={startOfPeriod}
              onResume={resumeSession}
              onEdit={openEditDialog}
              onMove={openMoveDialog}
            />
          ) : (
            // Day/Week View Layout
            <>
              <SessionStats
                periodStats={periodStats}
                isLoading={isPeriodStatsLoading}
              />

              <div className="space-y-6">
                {sortSessionGroups(Object.entries(groupedStackedSessions)).map(
                  ([groupTitle, groupSessions]) => {
                    const groupTotalDuration = groupSessions.reduce(
                      (sum, session) => sum + session.periodDuration,
                      0
                    );

                    return (
                      <div key={groupTitle}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <h3 className="pr-3 font-medium text-muted-foreground text-sm">
                              {groupTitle}
                            </h3>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          {groupSessions.length > 1 && (
                            <div className="ml-3 text-muted-foreground text-xs">
                              {formatDuration(groupTotalDuration)} {t('total')}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 space-y-3 md:space-y-4">
                          {groupSessions.map((session) => (
                            <StackedSessionItem
                              key={session.id}
                              stackedSession={session}
                              onResume={resumeSession}
                              onEdit={openEditDialog}
                              onDelete={setSessionToDelete}
                              onMove={openMoveDialog}
                              actionStates={actionStates}
                              tasks={null}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </>
          )}

          {/* Auto-load trigger */}
          <div ref={loadMoreRef} className="py-6">
            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-muted-foreground text-sm">
                  {t('loading_more')}...
                </span>
              </div>
            )}

            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => fetchNextPage()}
                  className="w-full transition-all hover:scale-105 md:w-auto"
                >
                  <ChevronDown className="mr-2 h-4 w-4" />
                  {t('load_more')}
                </Button>
              </div>
            )}

            {!hasNextPage && (sessionsForPeriod?.length || 0) > 10 && (
              <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
                <PartyPopper className="h-5 w-5" />
                <p className="text-muted-foreground text-sm">
                  {t('end_of_list')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Session Dialog */}
      <EditSessionDialog
        session={sessionToEdit}
        formState={editFormState}
        onFormChange={setEditFormState}
        onSave={saveEdit}
        onClose={closeEditDialog}
        isEditing={isEditing}
        isLoadingThreshold={isLoadingThreshold}
        thresholdDays={thresholdData?.threshold}
        categories={categories}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!sessionToDelete}
        onOpenChange={() => setSessionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_time_session')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirmation', {
                title: sessionToDelete?.title || '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSession}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('deleting') : t('delete_session_action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Missed Entry Dialog */}
      <MissedEntryDialog
        open={showMissedEntryDialog}
        onOpenChange={setShowMissedEntryDialog}
        categories={categories}
        wsId={wsId}
        workspace={workspace}
        prefillStartTime={prefillStartTime}
        prefillEndTime={prefillEndTime}
        canSkipProof={canManageTimeTrackingRequests}
      />

      {/* Move Session Dialog */}
      <WorkspaceSelectDialog
        isOpen={!!sessionToMove}
        onClose={closeMoveDialog}
        onConfirm={handleMoveSession}
        sessionTitle={sessionToMove?.title || ''}
        currentWorkspaceId={wsId}
        isMoving={isMoving}
      />

      {/* Resume Confirmation Dialog */}
      <AlertDialog
        open={showResumeConfirmation}
        onOpenChange={setShowResumeConfirmation}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resume_long_break_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingResumeSession &&
                t('resume_long_break_description', {
                  duration: formatDuration(
                    dayjs().diff(dayjs(pendingResumeSession.end_time), 'second')
                  ),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowResumeConfirmation(false)}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingResumeSession) {
                  resumeSession(pendingResumeSession);
                }
              }}
              className="bg-dynamic-orange text-white hover:bg-dynamic-orange/90"
            >
              {t('resume_continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
