'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckSquare,
  MoveRight,
  Search,
  X,
} from '@tuturuuu/icons';
import type {
  UpdateWorkspaceUserGroupSessionPayload,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { listWorkspaceUserGroupScheduleGroupSummaries } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { GroupedSessionTimeblockMoveForm } from './grouped-session-timeblock-move-form';
import { GroupedSessionTimeblockRow } from './grouped-session-timeblock-row';
import type {
  GroupedTimeblockMoveRequest,
  GroupedTimeblockMoveResult,
  GroupedTimeblockMoveScope,
  GroupedTimeblockMoveTarget,
} from './grouped-session-timeblock-types';
import {
  formatTimeblockRange,
  searchSession,
} from './grouped-session-timeblock-utils';
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  localDateTimeParts,
} from './session-time-utils';
import type { GroupedSessionTimeblock } from './user-group-calendar-density';

export type {
  GroupedTimeblockMoveRequest,
  GroupedTimeblockMoveResult,
  GroupedTimeblockMoveTarget,
} from './grouped-session-timeblock-types';

interface GroupedSessionTimeblockDialogProps {
  canChooseGroup: boolean;
  canUpdateSchedule: boolean;
  initialMoveTarget?: GroupedTimeblockMoveTarget | null;
  isMoving?: boolean;
  isUpdatingSession?: boolean;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onFilterGroup: (groupId: string) => void;
  onInlineUpdate: (
    session: WorkspaceUserGroupSession,
    payload: UpdateWorkspaceUserGroupSessionPayload
  ) => Promise<void>;
  onMoveSessions: (
    request: GroupedTimeblockMoveRequest
  ) => Promise<GroupedTimeblockMoveResult>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  timeblock: GroupedSessionTimeblock | null;
  wsId: string;
}

export function GroupedSessionTimeblockDialog({
  canChooseGroup,
  canUpdateSchedule,
  initialMoveTarget,
  isMoving,
  isUpdatingSession,
  onEditSession,
  onFilterGroup,
  onInlineUpdate,
  onMoveSessions,
  onOpenChange,
  open,
  timeblock,
  wsId,
}: GroupedSessionTimeblockDialogProps) {
  const t = useTranslations('ws-user-group-schedule');
  const locale = useLocale();
  const [searchValue, setSearchValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [moveTarget, setMoveTarget] =
    useState<GroupedTimeblockMoveTarget | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');
  const [moveTimezone, setMoveTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE);
  const [moveScope, setMoveScope] = useState<GroupedTimeblockMoveScope>('once');
  const [rosterSearchByGroupId, setRosterSearchByGroupId] = useState(
    () => new Map<string, string>()
  );

  useEffect(() => {
    if (!open || !timeblock) return;
    const timezone = timeblock.timezone || DEFAULT_SCHEDULE_TIMEZONE;
    const parts = localDateTimeParts(timeblock.startAt, timezone);
    setSearchValue('');
    setSelectedIds(new Set());
    setMoveTarget(initialMoveTarget ?? null);
    setMoveDate(parts.date);
    setMoveTime(parts.time);
    setMoveTimezone(timezone);
    setMoveScope('once');
    setRosterSearchByGroupId(new Map());
  }, [initialMoveTarget, open, timeblock]);

  const summaryGroupIds = useMemo(
    () =>
      Array.from(
        new Set(timeblock?.sessions.map((session) => session.groupId) ?? [])
      ).sort(),
    [timeblock?.sessions]
  );

  const summariesQuery = useQuery({
    enabled: open && !!timeblock && summaryGroupIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () =>
      timeblock
        ? listWorkspaceUserGroupScheduleGroupSummaries(wsId, {
            from: timeblock.startAt,
            groupIds: summaryGroupIds,
            timezone: timeblock.timezone || DEFAULT_SCHEDULE_TIMEZONE,
          })
        : Promise.resolve({ data: [] }),
    queryKey: [
      'workspace-user-group-schedule-group-summaries',
      wsId,
      timeblock?.startAt,
      timeblock?.timezone,
      summaryGroupIds.join(','),
    ],
    staleTime: 60_000,
  });

  const summaryByGroupId = useMemo(
    () =>
      new Map(
        (summariesQuery.data?.data ?? []).map((summary) => [
          summary.groupId,
          summary,
        ])
      ),
    [summariesQuery.data?.data]
  );

  const range = timeblock ? formatTimeblockRange(timeblock, locale) : '';
  const filteredSessions = useMemo(
    () =>
      timeblock?.sessions.filter((session) =>
        searchSession(
          session,
          searchValue,
          t('untitled_session'),
          summaryByGroupId.get(session.groupId),
          rosterSearchByGroupId.get(session.groupId),
          locale
        )
      ) ?? [],
    [
      locale,
      rosterSearchByGroupId,
      searchValue,
      summaryByGroupId,
      t,
      timeblock?.sessions,
    ]
  );
  const selectedSessions = useMemo(
    () =>
      timeblock?.sessions.filter((session) => selectedIds.has(session.id)) ??
      [],
    [selectedIds, timeblock?.sessions]
  );
  const allVisibleSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((session) => selectedIds.has(session.id));
  const moveSessions =
    moveTarget === 'all' ? (timeblock?.sessions ?? []) : selectedSessions;

  if (!timeblock) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const toggleSession = (sessionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleVisibleSessions = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldSelect = !allVisibleSelected;
      for (const session of filteredSessions) {
        if (shouldSelect) next.add(session.id);
        else next.delete(session.id);
      }
      return next;
    });
  };

  const submitMove = async () => {
    if (!moveTarget || moveSessions.length === 0) return;
    const result = await onMoveSessions({
      date: moveDate,
      scope: moveScope,
      sessions: moveSessions,
      time: moveTime,
      timezone: moveTimezone,
    });
    if (result.failedCount === 0) {
      setMoveTarget(null);
      setSelectedIds(new Set());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-2 left-2 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-4 sm:right-4 sm:left-auto sm:h-[calc(100dvh-2rem)] sm:w-[min(1040px,calc(100vw-2rem))] sm:translate-x-0 sm:translate-y-0"
        data-testid="grouped-timeblock-manager"
      >
        <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <DialogTitle>
                {t('grouped_timeblock_dialog_title', {
                  count: timeblock.sessions.length,
                })}
              </DialogTitle>
              <DialogDescription className="truncate">
                {range}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-muted-foreground text-sm">
              <Badge variant="secondary">
                {t('filtered_sessions_count', {
                  count: filteredSessions.length,
                  total: timeblock.sessions.length,
                })}
              </Badge>
              {selectedSessions.length > 0 && (
                <Badge variant="outline">
                  {t('selected_sessions_count', {
                    count: selectedSessions.length,
                  })}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="border-b px-4 py-3 sm:px-6">
          <div className="grid gap-3">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 w-full pr-9 pl-9"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t('grouped_timeblock_search_placeholder')}
              />
              {searchValue && (
                <Button
                  aria-label={t('clear_grouped_timeblock_search')}
                  className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 p-0"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setSearchValue('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {canUpdateSchedule && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={toggleVisibleSessions}
                >
                  <CheckSquare className="h-4 w-4" />
                  {allVisibleSelected
                    ? t('clear_visible_sessions')
                    : t('select_visible_sessions')}
                </Button>
                <Button
                  disabled={selectedSessions.length === 0}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setMoveTarget('selected')}
                >
                  <MoveRight className="h-4 w-4" />
                  {t('move_selected_sessions')}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => setMoveTarget('all')}
                >
                  <MoveRight className="h-4 w-4" />
                  {t('move_all_timeblock')}
                </Button>
              </div>
            )}
          </div>
        </div>

        {moveTarget && (
          <GroupedSessionTimeblockMoveForm
            date={moveDate}
            disabled={isMoving}
            hasRecurringSessions={moveSessions.some(
              (session) => !!session.seriesId
            )}
            scope={moveScope}
            sessionCount={moveSessions.length}
            time={moveTime}
            timezone={moveTimezone}
            onCancel={() => setMoveTarget(null)}
            onDateChange={setMoveDate}
            onScopeChange={setMoveScope}
            onSubmit={submitMove}
            onTimeChange={setMoveTime}
            onTimezoneChange={setMoveTimezone}
          />
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6"
          data-testid="grouped-timeblock-list"
        >
          {filteredSessions.length === 0 ? (
            <div className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm">
              {t('grouped_timeblock_no_search_results')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSessions.map((session) => (
                <GroupedSessionTimeblockRow
                  canChooseGroup={canChooseGroup}
                  canUpdateSchedule={canUpdateSchedule}
                  isInlineUpdating={isUpdatingSession}
                  isSummaryLoading={summariesQuery.isFetching}
                  key={session.id}
                  selected={selectedIds.has(session.id)}
                  session={session}
                  summary={summaryByGroupId.get(session.groupId)}
                  wsId={wsId}
                  onEditSession={onEditSession}
                  onFilterGroup={onFilterGroup}
                  onInlineUpdate={onInlineUpdate}
                  onRosterSearchTextChange={(groupId, value) => {
                    setRosterSearchByGroupId((current) => {
                      const next = new Map(current);
                      next.set(groupId, value);
                      return next;
                    });
                  }}
                  onToggleSelected={toggleSession}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 text-muted-foreground text-xs sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="truncate">{range}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
