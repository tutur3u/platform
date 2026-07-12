'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  RotateCcw,
  UserX,
  X,
} from '@tuturuuu/icons';
import {
  listWorkspaceUserGroupSessions,
  type WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  archived?: boolean;
  archived_until?: string | null;
  note?: string | null;
  role?: string | null;
  isGuest?: boolean;
};

export type InitialAttendanceProps = {
  wsId: string;
  groupId: string;
  initialSessions: WorkspaceUserGroupSession[];
  initialMembers: Member[];
  initialDate?: string; // yyyy-MM-dd
  initialAttendance?: Record<string, AttendanceEntry>;
  canUpdateAttendance: boolean;
  startingDate?: string | null;
  endingDate?: string | null;
};

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'NONE';

type AttendanceEntry = {
  status: AttendanceStatus;
  note?: string;
};

function sessionLocalDate(session: WorkspaceUserGroupSession) {
  return new Date(session.startsAt).toLocaleDateString('en-CA', {
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
}

function formatSessionTimeRange(
  session: WorkspaceUserGroupSession,
  locale: string
) {
  const startFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  const endFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone:
      session.endTimezone || session.startTimezone || 'Asia/Ho_Chi_Minh',
  });

  return `${startFormatter.format(new Date(session.startsAt))} - ${endFormatter.format(new Date(session.endsAt))}`;
}

export default function GroupAttendanceClient({
  wsId,
  groupId,
  initialSessions,
  initialMembers,
  initialDate,
  initialAttendance = {},
  canUpdateAttendance,
  startingDate,
  endingDate,
}: InitialAttendanceProps) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const tCommon = useTranslations('common');
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');
  const tUsers = useTranslations('ws-users');
  const tGuests = useTranslations('meet-together'); // For guest badge

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

  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
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

  const { data: sessions = initialSessions } = useQuery({
    queryKey: [
      'workspaces',
      wsId,
      'users',
      'groups',
      groupId,
      'session-timeblocks',
      sessionRange.from,
      sessionRange.to,
    ],
    queryFn: async () => {
      const response = await listWorkspaceUserGroupSessions(wsId, {
        from: sessionRange.from,
        groupId,
        to: sessionRange.to,
      });
      return response.data;
    },
    initialData: initialSessions,
    staleTime: 60 * 1000,
  });

  const effectiveStartingDate = startingDate ?? null;
  const effectiveEndingDate = endingDate ?? null;

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkspaceUserGroupSession[]>();
    for (const session of sessions) {
      const key = sessionLocalDate(session);
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
  const { data: allMembers = [] } = useQuery<Member[]>({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'members'],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members?limit=1000`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch group members');
      const { data } = await res.json();
      return data;
    },
    initialData: initialMembers,
    staleTime: 60 * 1000,
  });

  // Attendance display settings query
  const { data: showManagersConfig } = useQuery({
    queryKey: ['workspace-config', wsId, 'ATTENDANCE_SHOW_MANAGERS'],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/ATTENDANCE_SHOW_MANAGERS`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        if (res.status === 404) return 'true'; // Default to showing managers
        throw new Error('Failed to fetch config');
      }
      const data = await res.json();
      return data.value ?? 'true';
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Filter members based on display setting
  const showManagers = showManagersConfig?.trim().toLowerCase() !== 'false';
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

  const { data: attendance = {}, isLoading: isLoadingAttendance } = useQuery({
    queryKey: attendanceKey,
    queryFn: async () => {
      const query = new URLSearchParams({
        date: format(currentDate, 'yyyy-MM-dd'),
      });
      if (activeSessionId) query.set('sessionId', activeSessionId);

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/attendance?${query.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch attendance');
      const data = (await res.json()) as Array<{
        user_id: string;
        status: string;
        notes: string | null;
        session_id?: string | null;
      }>;

      const map: Record<string, AttendanceEntry> = {};
      const legacyRows: typeof data = [];
      const sessionRows: typeof data = [];
      for (const row of data) {
        if (activeSessionId && row.session_id === activeSessionId) {
          sessionRows.push(row);
        } else if (!row.session_id) {
          legacyRows.push(row);
        }
      }

      for (const row of activeSessionId ? legacyRows : data) {
        map[row.user_id] = {
          status: row.status as AttendanceStatus,
          note: row.notes || '',
        };
      }

      for (const row of sessionRows) {
        map[row.user_id] = {
          status: row.status as AttendanceStatus,
          note: row.notes || '',
        };
      }

      return map;
    },
    initialData:
      initialDate &&
      format(currentDate, 'yyyy-MM-dd') === initialDate &&
      !activeSessionId
        ? initialAttendance
        : undefined,
    staleTime: 60 * 1000,
  });

  const getSessionsForDay = useCallback(
    (d: Date) => sessionsByDate.get(format(d, 'yyyy-MM-dd')) ?? [],
    [sessionsByDate]
  );

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
  const [prevAttendanceScope, setPrevAttendanceScope] =
    useState(attendanceScope);
  if (attendanceScope !== prevAttendanceScope) {
    setPrevAttendanceScope(attendanceScope);
    setPendingMap(new Map());
    setCalendarMonth(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    );
  }

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
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/attendance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            payload.map((p) => ({
              ...p,
              date: dateStr,
              notes: p.note,
              session_id: activeSessionId,
            }))
          ),
        }
      );

      if (!res.ok) throw new Error('Failed to update attendance');
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

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === calendarMonth.getMonth() &&
    date.getFullYear() === calendarMonth.getFullYear();

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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
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
      {/* Calendar */}
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3 font-bold">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-dynamic-purple/10 text-dynamic-purple">
              <CalendarIcon className="h-5 w-5" />
            </span>
            {format(currentDate, 'dd/MM/yyyy')}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                setCalendarMonth(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth() - 1,
                    1
                  )
                )
              }
              disabled={isPrevDisabled}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                setCalendarMonth(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth() + 1,
                    1
                  )
                )
              }
              disabled={isNextDisabled}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-0">
          <div className="mb-2 font-semibold text-foreground/60">
            {calendarMonth.getFullYear()} /{' '}
            {calendarMonth.toLocaleString(locale, { month: '2-digit' })}
          </div>
          <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {days.map((d, i) => (
                <div
                  key={`d-${i}`}
                  className="flex justify-center rounded bg-foreground/5 p-2 font-semibold md:rounded-lg"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {daysInMonth.map((day, idx) => {
                const inMonth = isCurrentMonth(day);
                const daySessions = getSessionsForDay(day);
                const sessionCount = daySessions.length;
                const isSelected =
                  format(day, 'yyyy-MM-dd') ===
                  format(currentDate, 'yyyy-MM-dd');
                const base =
                  'flex justify-center rounded p-2 font-semibold md:rounded-lg';

                // Hide days that are not part of the current month (keep grid cell for layout)
                if (!inMonth) {
                  return (
                    <div
                      key={`day-${idx}`}
                      aria-hidden="true"
                      className={cn(
                        base,
                        'cursor-default border border-transparent'
                      )}
                    />
                  );
                }

                return (
                  <button
                    key={`day-${idx}`}
                    type="button"
                    onClick={() => {
                      const ds = format(day, 'yyyy-MM-dd');
                      void setDateStr(ds);
                      const nextSessions = sessionsByDate.get(ds) ?? [];
                      void setSessionId(
                        nextSessions.length === 1 ? nextSessions[0]!.id : ''
                      );
                    }}
                    className={cn(
                      base,
                      'relative min-h-14 flex-col items-center border transition-all duration-300',
                      isSelected
                        ? 'scale-105 border-dynamic-purple/40 bg-dynamic-purple/15 font-bold text-foreground shadow-md'
                        : sessionCount
                          ? 'border-foreground/10 bg-foreground/10 text-foreground hover:scale-105 hover:border-dynamic-purple/20 hover:bg-foreground/20 hover:shadow-sm'
                          : 'border-transparent text-foreground/30 hover:bg-foreground/5 hover:text-foreground/60'
                    )}
                  >
                    <span>{day.getDate()}</span>
                    {sessionCount > 0 && (
                      <span className="mt-1 max-w-full truncate rounded bg-dynamic-blue/10 px-1.5 py-0.5 text-[10px] text-dynamic-blue">
                        {sessionCount === 1
                          ? formatSessionTimeRange(daySessions[0]!, locale)
                          : tAtt('session_count_short', {
                              count: sessionCount,
                            })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance List / Empty State */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            {currentDateSessions.length > 0 ? (
              <>
                <div className="font-semibold text-sm">
                  {tAtt('select_session')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentDateSessions.map((session) => (
                    <Button
                      key={session.id}
                      type="button"
                      size="sm"
                      variant={
                        activeSessionId === session.id ? 'default' : 'outline'
                      }
                      className="h-auto justify-start gap-2 py-2"
                      onClick={() => {
                        void setSessionId(session.id);
                      }}
                    >
                      <Clock className="h-4 w-4" />
                      <span className="flex flex-col items-start">
                        <span>
                          {formatSessionTimeRange(session, locale)}
                          {session.startTimezone && (
                            <span className="text-muted-foreground">
                              {' '}
                              {session.startTimezone}
                            </span>
                          )}
                        </span>
                        <span className="text-xs opacity-80">
                          {session.title || session.groupName}
                          {session.tags.length > 0 &&
                            ` / ${session.tags.map((tag) => tag.name).join(', ')}`}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-muted-foreground text-sm">
                  <CalendarX2 className="h-5 w-5" />
                  <span>{tAtt('legacy_date_only_mode')}</span>
                </div>
                <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                  <Button size="sm" variant="secondary">
                    <CalendarIcon className="h-4 w-4" />
                    {tDetails('modify_schedule')}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg border-2 border-foreground/10 bg-foreground/5 p-3">
                <div className="font-medium text-foreground/60 text-sm">
                  {tAtt('summary_total')}
                </div>
                <div className="font-bold text-2xl">{summary.total}</div>
              </div>
              <div className="rounded-lg border-2 border-dynamic-green/20 bg-dynamic-green/10 p-3">
                <div className="font-medium text-dynamic-green text-sm">
                  {tAtt('summary_present')}
                </div>
                <div className="font-bold text-2xl text-dynamic-green">
                  {summary.present}
                </div>
              </div>
              <div className="rounded-lg border-2 border-dynamic-red/20 bg-dynamic-red/10 p-3">
                <div className="font-medium text-dynamic-red text-sm">
                  {tAtt('summary_absent')}
                </div>
                <div className="font-bold text-2xl text-dynamic-red">
                  {summary.absent}
                </div>
              </div>
              <div className="rounded-lg border-2 border-dynamic-yellow/20 bg-dynamic-yellow/10 p-3">
                <div className="font-medium text-dynamic-yellow text-sm">
                  {tAtt('summary_late')}
                </div>
                <div className="font-bold text-2xl text-dynamic-yellow">
                  {summary.late}
                </div>
              </div>
              <div className="rounded-lg border-2 border-foreground/15 bg-foreground/5 p-3">
                <div className="font-medium text-foreground/60 text-sm">
                  {tAtt('summary_not_marked')}
                </div>
                <div className="font-bold text-2xl text-foreground/70">
                  {summary.notAttended}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5">
          <CardContent className="flex gap-3 py-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-blue" />
            <div className="space-y-1">
              <div className="font-semibold text-dynamic-blue text-sm">
                {tAtt('help_title')}
              </div>
              <div className="text-foreground/70 text-sm leading-relaxed">
                {tAtt('help_description')}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {isLoadingAttendance
            ? Array.from({ length: 4 }).map((_, i) => (
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
            : members.map((m) => {
                const entry = getEffectiveEntry(m.id);
                const hasPendingChanges = pendingMap.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'relative flex flex-col gap-4 rounded-lg border p-4 shadow-sm transition-all hover:shadow-md',
                      hasPendingChanges
                        ? 'border-dynamic-blue/30 bg-dynamic-blue/5 ring-1 ring-dynamic-blue/20'
                        : 'border-foreground/10 bg-foreground/5'
                    )}
                  >
                    {hasPendingChanges && (
                      <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-sm">
                        <span className="font-bold text-xs">•</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="font-semibold">
                            {(m.display_name || m.full_name || '?')
                              .slice(0, 1)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div
                              className={cn(
                                'min-w-0 break-words font-semibold text-base',
                                (m.archived ||
                                  (m.archived_until &&
                                    new Date(m.archived_until) > new Date())) &&
                                  'text-dynamic-red line-through decoration-2 decoration-dynamic-red'
                              )}
                            >
                              {m.full_name
                                ? m.display_name
                                  ? `${m.full_name} (${m.display_name})`
                                  : m.full_name
                                : m.display_name || m.email || 'Unknown'}
                            </div>
                            {m.role === 'TEACHER' && (
                              <Badge
                                variant="default"
                                className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
                              >
                                {tDetails('managers')}
                              </Badge>
                            )}
                            {!!m.isGuest && m.role !== 'TEACHER' && (
                              <Badge
                                variant="secondary"
                                className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
                              >
                                {tGuests('guests')}
                              </Badge>
                            )}
                          </div>
                          <div className="truncate text-foreground/60 text-sm">
                            {m.phone || tAtt('phone_fallback')}
                          </div>
                          {(m.archived ||
                            (m.archived_until &&
                              new Date(m.archived_until) > new Date())) && (
                            <div className="mt-1 font-semibold text-dynamic-red text-xs">
                              {m.archived_until &&
                              new Date(m.archived_until) > new Date() ? (
                                <>
                                  {tUsers('status_archived_until')}:{' '}
                                  {format(
                                    new Date(m.archived_until),
                                    'dd/MM/yyyy HH:mm'
                                  )}
                                </>
                              ) : (
                                tUsers('status_archived')
                              )}
                              {m.note && <div>{m.note}</div>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-center gap-2 font-medium text-foreground/60 text-xs">
                          <span>{tAtt('status_label')}:</span>
                          {entry.status !== 'NONE' ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold',
                                entry.status === 'PRESENT' &&
                                  'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green',
                                entry.status === 'ABSENT' &&
                                  'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red',
                                entry.status === 'LATE' &&
                                  'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow'
                              )}
                            >
                              {entry.status === 'PRESENT' && (
                                <>
                                  <Check className="h-3 w-3" />
                                  {tAtt('present')}
                                </>
                              )}
                              {entry.status === 'ABSENT' && (
                                <>
                                  <UserX className="h-3 w-3" />
                                  {tAtt('absent')}
                                </>
                              )}
                              {entry.status === 'LATE' && (
                                <>
                                  <Clock className="h-3 w-3" />
                                  {tAtt('late')}
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="text-foreground/40">-</span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            size="sm"
                            disabled={!canUpdateAttendance}
                            aria-pressed={entry.status === 'PRESENT'}
                            variant="ghost"
                            className={cn(
                              'h-auto min-w-0 flex-col gap-1 border-2 px-2 py-3 transition-all',
                              entry.status !== 'NONE' &&
                                entry.status !== 'PRESENT' &&
                                'opacity-20 grayscale hover:opacity-100 hover:grayscale-0',
                              entry.status === 'PRESENT'
                                ? 'border-dynamic-green/40 bg-dynamic-green/20 text-dynamic-green hover:bg-dynamic-green/30'
                                : 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green/70 hover:border-dynamic-green/40 hover:bg-dynamic-green/10 hover:text-dynamic-green'
                            )}
                            onClick={() => toggleStatus(m.id, 'PRESENT')}
                          >
                            <Check className="h-5 w-5" />
                            <span className="max-w-full truncate font-semibold text-xs">
                              {tAtt('present')}
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canUpdateAttendance}
                            aria-pressed={entry.status === 'ABSENT'}
                            variant="ghost"
                            className={cn(
                              'h-auto min-w-0 flex-col gap-1 border-2 px-2 py-3 transition-all',
                              entry.status !== 'NONE' &&
                                entry.status !== 'ABSENT' &&
                                'opacity-20 grayscale hover:opacity-100 hover:grayscale-0',
                              entry.status === 'ABSENT'
                                ? 'border-dynamic-red/40 bg-dynamic-red/20 text-dynamic-red hover:bg-dynamic-red/30'
                                : 'border-dynamic-red/20 bg-dynamic-red/5 text-dynamic-red/70 hover:border-dynamic-red/40 hover:bg-dynamic-red/10 hover:text-dynamic-red'
                            )}
                            onClick={() => toggleStatus(m.id, 'ABSENT')}
                          >
                            <UserX className="h-5 w-5" />
                            <span className="max-w-full truncate font-semibold text-xs">
                              {tAtt('absent')}
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            disabled={!canUpdateAttendance}
                            aria-pressed={entry.status === 'LATE'}
                            variant="ghost"
                            className={cn(
                              'h-auto min-w-0 flex-col gap-1 border-2 px-2 py-3 transition-all',
                              entry.status !== 'NONE' &&
                                entry.status !== 'LATE' &&
                                'opacity-20 grayscale hover:opacity-100 hover:grayscale-0',
                              entry.status === 'LATE'
                                ? 'border-dynamic-yellow/40 bg-dynamic-yellow/20 text-dynamic-yellow hover:bg-dynamic-yellow/30'
                                : 'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow/70 hover:border-dynamic-yellow/40 hover:bg-dynamic-yellow/10 hover:text-dynamic-yellow'
                            )}
                            onClick={() => toggleStatus(m.id, 'LATE')}
                          >
                            <Clock className="h-5 w-5" />
                            <span className="max-w-full truncate font-semibold text-xs">
                              {tAtt('late')}
                            </span>
                          </Button>
                        </div>
                        {entry.status !== 'NONE' && (
                          <Button
                            size="sm"
                            disabled={!canUpdateAttendance}
                            variant="ghost"
                            className={cn(
                              'gap-2 border-2 border-foreground/20 bg-foreground/5 transition-all hover:border-foreground/30 hover:bg-foreground/10'
                            )}
                            onClick={() =>
                              setLocalAttendance(m.id, { status: 'NONE' })
                            }
                          >
                            <X className="h-4 w-4" />
                            <span className="text-sm">{tAtt('clear')}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="border-foreground/10 border-t" />
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor={`attendance-notes-${m.id}`}
                        className="font-medium text-sm"
                      >
                        {tAtt('notes_placeholder')}
                      </Label>
                      <Textarea
                        disabled={!canUpdateAttendance}
                        id={`attendance-notes-${m.id}`}
                        name={`attendance-notes-${m.id}`}
                        value={entry.note || ''}
                        onChange={(e) => {
                          setLocalAttendance(m.id, {
                            note: e.target.value,
                          });
                          // Auto-resize
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onFocus={(e) => {
                          // Auto-resize on focus
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        className="min-h-10 resize-none bg-card transition-all"
                        rows={1}
                        placeholder={tAtt('notes_placeholder')}
                      />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
