'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
import { createClient } from '@tuturuuu/supabase/next/client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { Label } from '@tuturuuu/ui/label';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Member = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

export type InitialAttendanceProps = {
  wsId: string;
  groupId: string;
  initialSessions: string[];
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
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');

  const dateParam = searchParams.getSingle('date');
  const initialDateStr = initialDate || format(new Date(), 'yyyy-MM-dd');
  const currentDateStr = dateParam || initialDateStr;
  const [currentDate, setCurrentDate] = useState<Date>(() =>
    parse(currentDateStr, 'yyyy-MM-dd', new Date())
  );

  // Sync local date when URL param changes
  useEffect(() => {
    const nextStr = dateParam || initialDateStr;
    const next = parse(nextStr, 'yyyy-MM-dd', new Date());
    if (format(next, 'yyyy-MM-dd') !== format(currentDate, 'yyyy-MM-dd')) {
      setCurrentDate(next);
    }
  }, [dateParam, initialDateStr, currentDate]);

  // Ensure URL contains date on first load (no refresh)
  useEffect(() => {
    if (!dateParam && initialDateStr) {
      searchParams.set({ date: initialDateStr }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, initialDateStr, searchParams.set]);

  // Sessions query (client) with initial data from RSC
  const { data: sessions = [] } = useQuery({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'sessions'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups')
        .select('sessions')
        .eq('id', groupId)
        .eq('ws_id', wsId)
        .single();
      if (error) throw error;
      return Array.isArray(data?.sessions) ? (data.sessions as string[]) : [];
    },
    initialData: initialSessions,
    staleTime: 60 * 1000,
  });

  // Members query (client) with initial data from RSC
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'members'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('workspace_users(*)')
        .eq('group_id', groupId)
        .eq('role', 'STUDENT');
      if (error) throw error;
      return (
        (data as any[])?.map((row) => ({
          id: row.workspace_users?.id,
          display_name: row.workspace_users?.display_name,
          full_name: row.workspace_users?.full_name,
          email: row.workspace_users?.email,
          phone: row.workspace_users?.phone,
          avatar_url: row.workspace_users?.avatar_url,
        })) || []
      );
    },
    initialData: initialMembers,
    staleTime: 60 * 1000,
  });

  // Attendance state is local (front-end only for now), managed via React Query cache
  const attendanceKey = [
    'workspaces',
    wsId,
    'users',
    'groups',
    groupId,
    'attendance',
    format(currentDate, 'yyyy-MM-dd'),
  ];

  const isDateAvailable = (sessionList: string[], d: Date) =>
    Array.isArray(sessionList) &&
    sessionList.some((s) => {
      const sd = new Date(s);
      return (
        sd.getDate() === d.getDate() &&
        sd.getMonth() === d.getMonth() &&
        sd.getFullYear() === d.getFullYear()
      );
    });

  const {
    data: attendance = {} as Record<string, AttendanceEntry>,
    isLoading: isLoadingAttendance,
  } = useQuery({
    queryKey: attendanceKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_group_attendance')
        .select('user_id,status,notes')
        .eq('group_id', groupId)
        .eq('date', format(currentDate, 'yyyy-MM-dd'));
      if (error) throw error;
      const mapped: Record<string, AttendanceEntry> = {};
      (data || []).forEach((row: any) => {
        mapped[row.user_id] = {
          status: row.status as AttendanceStatus,
          note: row.notes ?? '',
        };
      });
      return mapped;
    },
    initialData:
      format(currentDate, 'yyyy-MM-dd') === (initialDate || '')
        ? initialAttendance
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    enabled: isDateAvailable(sessions, currentDate),
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
      const supabase = createClient();
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const toDelete = payload
        .filter((p) => p.status === 'NONE')
        .map((p) => p.user_id);
      const toUpsert = payload
        .filter((p) => p.status !== 'NONE')
        .map((p) => ({
          group_id: groupId,
          date: dateStr,
          user_id: p.user_id,
          status: p.status,
          notes: p.note ?? '',
        }));

      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from('user_group_attendance')
          .delete()
          .eq('group_id', groupId)
          .eq('date', dateStr)
          .in('user_id', toDelete);
        if (delError) throw delError;
      }

      if (toUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('user_group_attendance')
          .upsert(toUpsert);
        if (upsertError) throw upsertError;
      }
    },
    onSuccess: async () => {
      setPendingMap(new Map());
      await queryClient.invalidateQueries({ queryKey: attendanceKey });
      toast.success('Attendance updated successfully');
    },
    onError: (e) => {
      console.error('Error saving attendance:', e);
      toast.error('Failed to update attendance');
    },
  });

  const handleReset = async () => {
    setPendingMap(new Map());
    await queryClient.invalidateQueries({ queryKey: attendanceKey });
  };

  const handleSave = async () => {
    if (pendingMap.size === 0) {
      toast.info('No changes to save');
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
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  );

  useEffect(() => {
    setCalendarMonth(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    );
  }, [currentDate]);

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
    if (!startingDate) return false;

    const start = new Date(startingDate);
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
  }, [startingDate, calendarMonth]);

  // Check if next button should be disabled based on endingDate
  const isNextDisabled = useMemo(() => {
    if (!endingDate) return false;

    const end = new Date(endingDate);
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
  }, [endingDate, calendarMonth]);

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
          <CardTitle className="font-bold">
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
                const available = inMonth && isDateAvailable(sessions, day);
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

                // Current month but no session on this day → show disabled cell with date
                if (!available)
                  return (
                    <div
                      key={`day-${idx}`}
                      className={cn(
                        base,
                        'cursor-default border border-transparent text-foreground/20'
                      )}
                    >
                      {day.getDate()}
                    </div>
                  );

                return (
                  <button
                    key={`day-${idx}`}
                    type="button"
                    onClick={() => {
                      const ds = format(day, 'yyyy-MM-dd');
                      searchParams.set({ date: ds }, false);
                      setCurrentDate(day);
                    }}
                    className={cn(
                      base,
                      'relative border transition-all duration-300',
                      isSelected
                        ? 'scale-105 border-dynamic-purple/40 bg-dynamic-purple/15 font-bold text-foreground shadow-md'
                        : 'border-foreground/10 bg-foreground/10 text-foreground hover:scale-105 hover:border-dynamic-purple/20 hover:bg-foreground/20 hover:shadow-sm'
                    )}
                  >
                    {day.getDate()}
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-dynamic-blue" />
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance List / Empty State */}
      <div className="space-y-4 lg:col-span-2">
        {!isDateAvailable(sessions, currentDate) ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-6">
              <div className="flex flex-col items-center justify-center gap-4">
                <CalendarX2 className="h-10 w-10 text-foreground/60" />
                <div className="text-center text-foreground/60">
                  {tAtt('no_session_for_day')}
                </div>
              </div>
              <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                <Button variant="secondary">
                  <CalendarIcon className="h-4 w-4" />
                  {tDetails('modify_schedule')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                              <div className="truncate font-semibold text-base">
                                {m.full_name
                                  ? m.display_name
                                    ? `${m.full_name} (${m.display_name})`
                                    : m.full_name
                                  : m.display_name || m.email || 'Unknown'}
                              </div>
                              <div className="truncate text-foreground/60 text-sm">
                                {m.phone || tAtt('phone_fallback')}
                              </div>
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
                                  'h-auto flex-col gap-1 border-2 py-3 transition-all',
                                  entry.status === 'PRESENT'
                                    ? 'border-dynamic-green/40 bg-dynamic-green/20 text-dynamic-green hover:bg-dynamic-green/30'
                                    : 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green/70 hover:border-dynamic-green/40 hover:bg-dynamic-green/10 hover:text-dynamic-green'
                                )}
                                onClick={() => toggleStatus(m.id, 'PRESENT')}
                              >
                                <Check className="h-5 w-5" />
                                <span className="font-semibold text-xs">
                                  {tAtt('present')}
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                disabled={!canUpdateAttendance}
                                aria-pressed={entry.status === 'ABSENT'}
                                variant="ghost"
                                className={cn(
                                  'h-auto flex-col gap-1 border-2 py-3 transition-all',
                                  entry.status === 'ABSENT'
                                    ? 'border-dynamic-red/40 bg-dynamic-red/20 text-dynamic-red hover:bg-dynamic-red/30'
                                    : 'border-dynamic-red/20 bg-dynamic-red/5 text-dynamic-red/70 hover:border-dynamic-red/40 hover:bg-dynamic-red/10 hover:text-dynamic-red'
                                )}
                                onClick={() => toggleStatus(m.id, 'ABSENT')}
                              >
                                <UserX className="h-5 w-5" />
                                <span className="font-semibold text-xs">
                                  {tAtt('absent')}
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                disabled={!canUpdateAttendance}
                                aria-pressed={entry.status === 'LATE'}
                                variant="ghost"
                                className={cn(
                                  'h-auto flex-col gap-1 border-2 py-3 transition-all',
                                  entry.status === 'LATE'
                                    ? 'border-dynamic-yellow/40 bg-dynamic-yellow/20 text-dynamic-yellow hover:bg-dynamic-yellow/30'
                                    : 'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow/70 hover:border-dynamic-yellow/40 hover:bg-dynamic-yellow/10 hover:text-dynamic-yellow'
                                )}
                                onClick={() => toggleStatus(m.id, 'LATE')}
                              >
                                <Clock className="h-5 w-5" />
                                <span className="font-semibold text-xs">
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
                            htmlFor="notes"
                            className="font-medium text-sm"
                          >
                            {tAtt('notes_placeholder')}
                          </Label>
                          <Textarea
                            disabled={!canUpdateAttendance}
                            id="notes"
                            name="notes"
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
                            placeholder="Add notes..."
                          />
                        </div>
                      </div>
                    );
                  })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
