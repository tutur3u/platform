'use client';

import { Clock, History, Plus } from '@tuturuuu/icons';
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
import { useCallback, useMemo, useState } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { formatDuration } from '@/lib/time-format';
import MissedEntryDialog from '../missed-entry-dialog';
import { WorkspaceSelectDialog } from '../workspace-select-dialog';
import { EditSessionDialog } from './edit-session-dialog';
import { MonthView } from './month-view';
import { PeriodNavigation } from './period-navigation';
import { SessionFilters } from './session-filters';
import { SessionStats } from './session-stats';
import type {
  FilterState,
  SessionHistoryProps,
  ViewMode,
} from './session-types';
import {
  calculatePeriodStats,
  getDurationCategory,
  getTimeOfDayCategory,
  sessionOverlapsPeriod,
  sortSessionGroups,
  stackSessions,
} from './session-utils';
import { StackedSessionItem } from './stacked-session-item';
import { useSessionActions } from './use-session-actions';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export function SessionHistory({
  wsId,
  sessions,
  categories,
}: Omit<SessionHistoryProps, 'tasks'>) {
  const t = useTranslations('time-tracker.session_history');
  const { data: thresholdDays, isLoading: isLoadingThreshold } =
    useWorkspaceTimeThreshold(wsId);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    categoryId: 'all',
    duration: 'all',
    productivity: 'all',
    timeOfDay: 'all',
    projectContext: 'all',
    sessionQuality: 'all',
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(dayjs());

  const userTimezone = dayjs.tz.guess();

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
      productivity: 'all',
      timeOfDay: 'all',
      projectContext: 'all',
      sessionQuality: 'all',
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

  // Filter functions
  const getProjectContext = useCallback(
    (session: {
      task_id?: string | null;
      category?: { name?: string } | null;
    }): string => {
      if (session.task_id) {
        // Return generic project-work if task exists - specific board name not needed for filtering
        return 'project-work';
      }
      if (session.category?.name?.toLowerCase().includes('meeting'))
        return 'meetings';
      if (session.category?.name?.toLowerCase().includes('learn'))
        return 'learning';
      if (session.category?.name?.toLowerCase().includes('admin'))
        return 'administrative';
      return 'general';
    },
    []
  );

  // Filtered sessions
  const filteredSessions = useMemo(
    () =>
      sessions?.filter((session) => {
        // Search filter
        if (
          filters.searchQuery &&
          !session.title
            .toLowerCase()
            .includes(filters.searchQuery.toLowerCase()) &&
          !session.description
            ?.toLowerCase()
            .includes(filters.searchQuery.toLowerCase())
        ) {
          return false;
        }

        // Category filter
        if (
          filters.categoryId !== 'all' &&
          session.category_id !== filters.categoryId
        )
          return false;

        // Duration filter
        if (
          filters.duration !== 'all' &&
          getDurationCategory(session) !== filters.duration
        )
          return false;

        // Time of day filter
        if (
          filters.timeOfDay !== 'all' &&
          getTimeOfDayCategory(session, userTimezone) !== filters.timeOfDay
        )
          return false;

        // Project context filter
        if (
          filters.projectContext !== 'all' &&
          getProjectContext(session) !== filters.projectContext
        )
          return false;

        return true;
      }),
    [sessions, filters, userTimezone, getProjectContext]
  );

  // Period calculations
  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const view = viewMode === 'week' ? 'isoWeek' : viewMode;
    const start = currentDate.tz(userTimezone).startOf(view);
    const end = currentDate.tz(userTimezone).endOf(view);
    return { startOfPeriod: start, endOfPeriod: end };
  }, [currentDate, viewMode, userTimezone]);

  const sessionsForPeriod = useMemo(
    () =>
      filteredSessions?.filter((session) =>
        sessionOverlapsPeriod(session, startOfPeriod, endOfPeriod, userTimezone)
      ),
    [filteredSessions, startOfPeriod, endOfPeriod, userTimezone]
  );

  const periodStats = useMemo(
    () =>
      calculatePeriodStats(
        sessionsForPeriod,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      ),
    [sessionsForPeriod, startOfPeriod, endOfPeriod, userTimezone]
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
      <Card className="shadow-sm">
        <CardHeader className="gap-4 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                <History className="h-5 w-5 text-dynamic-orange md:h-6 md:w-6" />
              </div>
              <div>
                <div className="font-bold tracking-tight">{t('title')}</div>
                {(sessionsForPeriod?.length || 0) > 0 && (
                  <div className="font-normal text-muted-foreground text-xs md:text-sm">
                    {sessionsForPeriod?.length === 1
                      ? t('sessions_count', {
                          count: sessionsForPeriod?.length || 0,
                        })
                      : t('sessions_count_plural', {
                          count: sessionsForPeriod?.length || 0,
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
                filteredSessions={filteredSessions}
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
          {sessionsForPeriod?.length === 0 ? (
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
              sessionsForPeriod={sessionsForPeriod}
              groupedStackedSessions={groupedStackedSessions}
              startOfPeriod={startOfPeriod}
              onResume={resumeSession}
              onEdit={openEditDialog}
              onMove={openMoveDialog}
            />
          ) : (
            // Day/Week View Layout
            <>
              <SessionStats periodStats={periodStats} />

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
        thresholdDays={thresholdDays}
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
        prefillStartTime={prefillStartTime}
        prefillEndTime={prefillEndTime}
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
    </>
  );
}
