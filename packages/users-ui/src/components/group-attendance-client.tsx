'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw, RotateCcw } from '@tuturuuu/icons';
import {
  getWorkspaceUserGroupAttendanceShowManagers,
  listWorkspaceUserGroupAttendance,
  listWorkspaceUserGroupAttendanceMembers,
  listWorkspaceUserGroupSessions,
  saveWorkspaceUserGroupAttendance,
  type WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GroupAttendanceCalendar } from './group-attendance-calendar';
import {
  type AttendanceEntry,
  type AttendanceMember,
  type AttendanceStatus,
  GroupAttendanceMemberCard,
} from './group-attendance-member-card';
import { GroupAttendanceOverview } from './group-attendance-overview';
import {
  attendanceSessionsQueryKey,
  buildAttendanceMap,
  filterAttendanceSessions,
  getAttendanceMonth,
  sessionAttendanceDate,
} from './group-attendance-utils';

export type InitialAttendanceProps = {
  wsId: string;
  groupId: string;
  initialSessions: WorkspaceUserGroupSession[];
  initialMembers: AttendanceMember[];
  initialDate?: string; // yyyy-MM-dd
  initialSessionId?: string | null;
  initialAttendance?: Record<string, AttendanceEntry>;
  canUpdateAttendance: boolean;
  startingDate?: string | null;
  endingDate?: string | null;
};

export default function GroupAttendanceClient({
  wsId,
  groupId,
  initialSessions,
  initialMembers,
  initialDate,
  initialSessionId,
  initialAttendance = {},
  canUpdateAttendance,
  startingDate,
  endingDate,
}: InitialAttendanceProps) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const tCommon = useTranslations('common');
  const tAtt = useTranslations('ws-user-group-attendance');

  const [dateStr, setDateStr] = useQueryState(
    'date',
    parseAsString.withDefault(initialDate || format(new Date(), 'yyyy-MM-dd'))
  );
  const [sessionId, setSessionId] = useQueryState(
    'session',
    parseAsString.withDefault('')
  );

  const currentDate = useMemo(
    () => parse(dateStr, 'yyyy-MM-dd', new Date()),
    [dateStr]
  );

  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    getAttendanceMonth(currentDate)
  );

  const sessionRange = useMemo(() => {
    const from = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      -6
    );
    const to = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      8
    );
    return { from: from.toISOString(), to: to.toISOString() };
  }, [calendarMonth]);

  const initialVisibleSessions = useMemo(
    () => filterAttendanceSessions(initialSessions),
    [initialSessions]
  );

  const {
    data: sessions = initialVisibleSessions,
    isError: isSessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: attendanceSessionsQueryKey(wsId, groupId, sessionRange),
    queryFn: async () => {
      const response = await listWorkspaceUserGroupSessions(wsId, {
        from: sessionRange.from,
        groupId,
        includeCancelled: true,
        to: sessionRange.to,
      });
      return filterAttendanceSessions(response.data);
    },
    initialData: initialVisibleSessions,
    staleTime: 60 * 1000,
  });

  const effectiveStartingDate = startingDate ?? null;
  const effectiveEndingDate = endingDate ?? null;

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkspaceUserGroupSession[]>();
    for (const session of sessions) {
      const key = sessionAttendanceDate(session);
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [sessions]);

  const currentDateSessions = sessionsByDate.get(dateStr) ?? [];
  const selectedSession =
    currentDateSessions.find((session) => session.id === sessionId) ?? null;
  const activeSessionId = selectedSession?.id ?? null;

  useEffect(() => {
    if (
      currentDateSessions.length === 1 &&
      sessionId !== currentDateSessions[0]!.id
    ) {
      void setSessionId(currentDateSessions[0]!.id);
      return;
    }

    if (
      currentDateSessions.length > 0 &&
      sessionId &&
      !currentDateSessions.some((session) => session.id === sessionId)
    ) {
      void setSessionId('');
    }
  }, [currentDateSessions, sessionId, setSessionId]);

  // Members query (client) with initial data from RSC
  const {
    data: allMembers = [],
    isError: isMembersError,
    refetch: refetchMembers,
  } = useQuery<AttendanceMember[]>({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'members'],
    queryFn: async () => {
      const response = await listWorkspaceUserGroupAttendanceMembers(
        wsId,
        groupId,
        { limit: 1000 }
      );
      return response.data as AttendanceMember[];
    },
    initialData: initialMembers,
    staleTime: 60 * 1000,
  });

  // Attendance display settings query
  const { data: showManagersConfig } = useQuery({
    queryKey: ['workspace-config', wsId, 'ATTENDANCE_SHOW_MANAGERS'],
    queryFn: () => getWorkspaceUserGroupAttendanceShowManagers(wsId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Filter members based on display setting
  const showManagers = showManagersConfig !== false;
  const members = useMemo(() => {
    if (showManagers) return allMembers;
    return allMembers.filter((m) => m.role !== 'TEACHER');
  }, [allMembers, showManagers]);

  // Attendance state is local (front-end only for now), managed via React Query cache
  const attendanceKey = [
    'workspaces',
    wsId,
    'users',
    'groups',
    groupId,
    'attendance',
    format(currentDate, 'yyyy-MM-dd'),
    activeSessionId ?? 'legacy',
  ];

  const {
    data: attendance = {},
    isError: isAttendanceError,
    isLoading: isLoadingAttendance,
    refetch: refetchAttendance,
  } = useQuery({
    queryKey: attendanceKey,
    queryFn: async () => {
      const data = await listWorkspaceUserGroupAttendance(wsId, groupId, {
        date: format(currentDate, 'yyyy-MM-dd'),
        sessionId: activeSessionId,
      });

      return buildAttendanceMap(data, activeSessionId);
    },
    initialData:
      initialDate &&
      format(currentDate, 'yyyy-MM-dd') === initialDate &&
      (activeSessionId ?? null) === (initialSessionId ?? null)
        ? initialAttendance
        : undefined,
    staleTime: 60 * 1000,
  });

  // Pending changes tracking for batch save
  type PendingAttendance = {
    user_id: string;
    status?: AttendanceStatus;
    note?: string | null;
  };
  const [pendingMap, setPendingMap] = useState<Map<string, PendingAttendance>>(
    new Map()
  );

  // Reset pending changes when date changes
  const attendanceScope = `${dateStr}:${activeSessionId ?? 'legacy'}`;
  useEffect(() => {
    void attendanceScope;
    setPendingMap(new Map());
    setCalendarMonth(getAttendanceMonth(currentDate));
  }, [attendanceScope, currentDate]);

  // Submitting state comes from mutation below

  const getEffectiveEntry = useCallback(
    (userId: string): AttendanceEntry => {
      const base = attendance[userId] || {
        status: 'NONE' as AttendanceStatus,
        note: '',
      };
      const pending = pendingMap.get(userId);
      return {
        status: pending?.status ?? base.status,
        note: (pending?.note ?? base.note) || '',
      };
    },
    [attendance, pendingMap]
  );

  const setLocalAttendance = (
    userId: string,
    update: { status?: AttendanceStatus; note?: string | null }
  ) => {
    // Update optimistic cache for immediate UI feedback
    const previous =
      queryClient.getQueryData<Record<string, AttendanceEntry>>(
        attendanceKey
      ) || {};
    const next: Record<string, AttendanceEntry> = { ...previous };
    const curr = next[userId] || {
      status: 'NONE' as AttendanceStatus,
      note: '',
    };
    next[userId] = {
      status: update.status ?? curr.status,
      note: (update.note ?? curr.note) || '',
    };
    queryClient.setQueryData(attendanceKey, next);

    // Track pending change
    setPendingMap((prev) => {
      const draft = new Map(prev);
      const existing = draft.get(userId) || { user_id: userId };
      const merged: PendingAttendance = { ...existing };
      if (update.status !== undefined) merged.status = update.status;
      if (update.note !== undefined) merged.note = update.note ?? '';

      // If merged state equals current server state, remove from pending; else set
      const effectiveAfter = {
        status: merged.status ?? attendance[userId]?.status ?? 'NONE',
        note: merged.note ?? attendance[userId]?.note ?? '',
      };
      const serverState = {
        status: attendance[userId]?.status ?? 'NONE',
        note: attendance[userId]?.note ?? '',
      };
      const isSame =
        effectiveAfter.status === serverState.status &&
        (effectiveAfter.note || '') === (serverState.note || '');
      if (isSame) {
        draft.delete(userId);
      } else {
        draft.set(userId, { ...merged, user_id: userId });
      }
      return draft;
    });
  };

  const toggleStatus = (userId: string, next: AttendanceStatus) => {
    const current = getEffectiveEntry(userId).status;
    const newStatus: AttendanceStatus = current === next ? 'NONE' : next;
    setLocalAttendance(userId, { status: newStatus });
  };

  // Batch save mutation using Supabase
  const saveAttendanceMutation = useMutation({
    mutationFn: async (
      payload: Array<{
        user_id: string;
        status: AttendanceStatus;
        note: string;
      }>
    ) => {
      await saveWorkspaceUserGroupAttendance(
        wsId,
        groupId,
        payload.map((entry) => ({
          user_id: entry.user_id,
          status: entry.status,
          date: format(currentDate, 'yyyy-MM-dd'),
          notes: entry.note,
          session_id: activeSessionId,
        }))
      );
    },
    onSuccess: async () => {
      setPendingMap(new Map());
      await queryClient.invalidateQueries({ queryKey: attendanceKey });
      toast.success(tAtt('save_success'));
    },
    onError: (e) => {
      console.error('Error saving attendance:', e);
      toast.error(tAtt('save_error'));
    },
  });

  const handleReset = async () => {
    setPendingMap(new Map());
    await queryClient.invalidateQueries({ queryKey: attendanceKey });
  };

  const handleSave = async () => {
    if (pendingMap.size === 0) {
      toast.info(tAtt('no_changes'));
      return;
    }
    const payload: Array<{
      user_id: string;
      status: AttendanceStatus;
      note: string;
    }> = [];
    pendingMap.forEach((pending, user_id) => {
      const base = attendance[user_id] || {
        status: 'NONE' as AttendanceStatus,
        note: '',
      };
      const finalStatus = pending.status ?? base.status;
      const finalNote = (pending.note ?? base.note ?? '') as string;
      payload.push({ user_id, status: finalStatus, note: finalNote });
    });
    await saveAttendanceMutation.mutateAsync(payload);
  };

  // Calendar helpers (mimic schedule.tsx)
  const localeStr = useLocale();

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const newDay = new Date(calendarMonth);
      newDay.setDate(
        calendarMonth.getDate() -
          (calendarMonth.getDay() === 0 ? 6 : calendarMonth.getDay() - 1) +
          i
      );
      return newDay.toLocaleString(localeStr, { weekday: 'narrow' });
    });
  }, [calendarMonth, localeStr]);

  const daysInMonth = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const first = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        1
      );
      const dayOfWeek = first.getDay();
      const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      first.setDate(first.getDate() - adjustment + i);
      return first;
    });
  }, [calendarMonth]);

  // Check if prev button should be disabled based on startingDate
  const isPrevDisabled = useMemo(() => {
    if (!effectiveStartingDate) return false;

    const start = new Date(effectiveStartingDate);
    const prevMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() - 1,
      1
    );

    return (
      prevMonth.getFullYear() < start.getFullYear() ||
      (prevMonth.getFullYear() === start.getFullYear() &&
        prevMonth.getMonth() < start.getMonth())
    );
  }, [effectiveStartingDate, calendarMonth]);

  // Check if next button should be disabled based on endingDate
  const isNextDisabled = useMemo(() => {
    if (!effectiveEndingDate) return false;

    const end = new Date(effectiveEndingDate);
    const nextMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      1
    );

    return (
      nextMonth.getFullYear() > end.getFullYear() ||
      (nextMonth.getFullYear() === end.getFullYear() &&
        nextMonth.getMonth() > end.getMonth())
    );
  }, [effectiveEndingDate, calendarMonth]);

  const summary = useMemo(() => {
    const total = members.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    members.forEach((m) => {
      const v = getEffectiveEntry(m.id);
      if (v.status === 'PRESENT') present += 1;
      else if (v.status === 'ABSENT') absent += 1;
      else if (v.status === 'LATE') late += 1;
    });
    const notAttended = total - present - absent - late;
    return { total, present, absent, late, notAttended };
  }, [members, getEffectiveEntry]);

  const canEditSelectedAttendance =
    canUpdateAttendance && selectedSession?.status !== 'cancelled';

  return (
    <div className="@container grid min-w-0 @min-[72rem]:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] @min-[72rem]:items-start gap-4">
      <StickyBottomBar
        show={pendingMap.size > 0}
        message={`${tAtt('unsaved_changes_message')} (${pendingMap.size})`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={saveAttendanceMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              {tCommon('reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveAttendanceMutation.isPending}
              className={cn(
                'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
              )}
            >
              <Check className="h-4 w-4" />
              {saveAttendanceMutation.isPending
                ? tCommon('saving')
                : tCommon('save')}
            </Button>
          </>
        }
      />
      <GroupAttendanceCalendar
        calendarMonth={calendarMonth}
        currentDate={currentDate}
        days={days}
        daysInMonth={daysInMonth}
        isNextDisabled={isNextDisabled}
        isPrevDisabled={isPrevDisabled}
        locale={locale}
        sessionsByDate={sessionsByDate}
        onMonthChange={setCalendarMonth}
        onDateSelect={(day, daySessions) => {
          const nextDate = format(day, 'yyyy-MM-dd');
          setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
          void setDateStr(nextDate);
          void setSessionId(daySessions.length === 1 ? daySessions[0]!.id : '');
        }}
      />

      {/* Attendance List / Empty State */}
      <div className="min-w-0 space-y-4">
        <GroupAttendanceOverview
          activeSessionId={activeSessionId}
          groupId={groupId}
          isSessionsError={isSessionsError}
          locale={locale}
          onRetrySessions={() => void refetchSessions()}
          onSelectSession={(nextSessionId) => void setSessionId(nextSessionId)}
          selectedSession={selectedSession}
          sessions={currentDateSessions}
          summary={summary}
          wsId={wsId}
        />
        <div className="grid @min-[64rem]:grid-cols-2 grid-cols-1 @min-[64rem]:gap-4 gap-3">
          {isMembersError || isAttendanceError ? (
            <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-5 2xl:col-span-2">
              <p className="font-medium text-sm">{tAtt('load_error')}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  void refetchMembers();
                  void refetchAttendance();
                }}
              >
                <RefreshCw className="h-4 w-4" />
                {tAtt('retry')}
              </Button>
            </div>
          ) : isLoadingAttendance ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex flex-col gap-4 rounded-lg border border-foreground/10 bg-foreground/5 p-4"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-32 self-center" />
                    <div className="grid grid-cols-3 gap-2">
                      <Skeleton className="h-16 rounded" />
                      <Skeleton className="h-16 rounded" />
                      <Skeleton className="h-16 rounded" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-px w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full rounded" />
                </div>
              </div>
            ))
          ) : (
            members.map((member) => {
              const entry = getEffectiveEntry(member.id);
              return (
                <GroupAttendanceMemberCard
                  key={member.id}
                  canEdit={canEditSelectedAttendance}
                  entry={entry}
                  hasPendingChanges={pendingMap.has(member.id)}
                  member={member}
                  onClear={() =>
                    setLocalAttendance(member.id, { status: 'NONE' })
                  }
                  onNoteChange={(note) =>
                    setLocalAttendance(member.id, { note })
                  }
                  onStatusChange={(status) => toggleStatus(member.id, status)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
