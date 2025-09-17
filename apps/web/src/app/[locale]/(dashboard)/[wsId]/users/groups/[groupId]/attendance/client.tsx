'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Check, Clock, ChevronLeft, ChevronRight, UserX, CalendarIcon, CalendarX2, RotateCcw } from '@tuturuuu/ui/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { Textarea } from '@tuturuuu/ui/textarea';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { format, parse } from 'date-fns';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSearchParams from '@/hooks/useSearchParams';
import Link from 'next/link';
import { Label } from '@tuturuuu/ui/label';

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
};

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE';

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
}: InitialAttendanceProps) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tCommon = useTranslations('common');
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');
  const tUA = useTranslations('ws-user-attendance');

  const dateParam = searchParams.getSingle('date');
  const initialDateStr = initialDate || format(new Date(), 'yyyy-MM-dd');
  const currentDateStr = dateParam || initialDateStr;
  const [currentDate, setCurrentDate] = useState<Date>(() => parse(currentDateStr, 'yyyy-MM-dd', new Date()));

  // Sync local date when URL param changes
  useEffect(() => {
    const nextStr = dateParam || initialDateStr;
    const next = parse(nextStr, 'yyyy-MM-dd', new Date());
    if (format(next, 'yyyy-MM-dd') !== format(currentDate, 'yyyy-MM-dd')) {
      setCurrentDate(next);
    }
  }, [dateParam, initialDateStr]);

  // Ensure URL contains date on first load (no refresh)
  useEffect(() => {
    if (!dateParam && initialDateStr) {
      searchParams.set({ date: initialDateStr }, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return (data?.sessions as string[]) || [];
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
    sessionList?.some((s) => {
      const sd = new Date(s);
      return sd.getDate() === d.getDate() && sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
    });

  const { data: attendance = {} as Record<string, AttendanceEntry> } = useQuery({
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
        mapped[row.user_id] = { status: row.status as AttendanceStatus, note: row.notes ?? '' };
      });
      return mapped;
    },
    initialData: format(currentDate, 'yyyy-MM-dd') === (initialDate || '') ? initialAttendance : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    enabled: isDateAvailable(sessions, currentDate),
  });

  // Pending changes tracking for batch save
  type PendingAttendance = {
    user_id: string;
    status?: AttendanceStatus | 'NONE';
    note?: string | null;
  };
  const [pendingMap, setPendingMap] = useState<Map<string, PendingAttendance>>(new Map());
  // Submitting state comes from mutation below

  const getEffectiveEntry = (userId: string): AttendanceEntry => {
    const base = attendance[userId] || { status: 'NONE' as AttendanceStatus, note: '' };
    const pending = pendingMap.get(userId);
    return {
      status: (pending?.status ?? base.status) as AttendanceStatus,
      note: (pending?.note ?? base.note) || '',
    };
  };

  const setLocalAttendance = (
    userId: string,
    update: { status?: AttendanceStatus | 'NONE'; note?: string | null }
  ) => {
    // Update optimistic cache for immediate UI feedback
    const previous = queryClient.getQueryData<Record<string, AttendanceEntry>>(attendanceKey) || {};
    const next: Record<string, AttendanceEntry> = { ...previous };
    const curr = next[userId] || { status: 'NONE' as AttendanceStatus, note: '' };
    next[userId] = {
      status: (update.status ?? curr.status) as AttendanceStatus,
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
        status: (merged.status ?? (attendance[userId]?.status ?? 'NONE')) as AttendanceStatus | 'NONE',
        note: merged.note ?? attendance[userId]?.note ?? '',
      };
      const serverState = {
        status: (attendance[userId]?.status ?? 'NONE') as AttendanceStatus | 'NONE',
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
    const current = (getEffectiveEntry(userId)?.status ?? 'NONE') as AttendanceStatus | 'NONE';
    const newStatus: AttendanceStatus | 'NONE' = current === next ? ('NONE' as const) : next;
    setLocalAttendance(userId, { status: newStatus });
  };

  // Batch save mutation using Supabase
  const saveAttendanceMutation = useMutation({
    mutationFn: async (payload: Array<{ user_id: string; status: AttendanceStatus | 'NONE'; note: string }>) => {
      const supabase = createClient();
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const toDelete = payload.filter((p) => p.status === 'NONE').map((p) => p.user_id);
      const toUpsert = payload
        .filter((p) => p.status !== 'NONE')
        .map((p) => ({
          group_id: groupId,
          date: dateStr,
          user_id: p.user_id,
          status: p.status as AttendanceStatus,
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
    const payload: Array<{ user_id: string; status: AttendanceStatus | 'NONE'; note: string }> = [];
    pendingMap.forEach((pending, user_id) => {
      const base = attendance[user_id] || { status: 'NONE' as AttendanceStatus, note: '' };
      const finalStatus = (pending.status ?? base.status) as AttendanceStatus | 'NONE';
      const finalNote = (pending.note ?? base.note ?? '') as string;
      payload.push({ user_id, status: finalStatus, note: finalNote });
    });
    await saveAttendanceMutation.mutateAsync(payload);
  };

  // Calendar helpers (mimic schedule.tsx)
  const localeStr = useLocale();
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  useEffect(() => {
    setCalendarMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const newDay = new Date(calendarMonth);
      newDay.setDate(calendarMonth.getDate() - (calendarMonth.getDay() === 0 ? 6 : calendarMonth.getDay() - 1) + i);
      return newDay.toLocaleString(localeStr, { weekday: 'narrow' });
    });
  }, [calendarMonth, localeStr]);

  const daysInMonth = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const dayOfWeek = first.getDay();
      const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      first.setDate(first.getDate() - adjustment + i);
      return first;
    });
  }, [calendarMonth]);

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === calendarMonth.getMonth() && date.getFullYear() === calendarMonth.getFullYear();



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
  }, [pendingMap, attendance, members]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <StickyBottomBar
        show={pendingMap.size > 0}
        message={tAtt('unsaved_changes_message')}
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
              className={cn('bg-dynamic-blue/10 border border-dynamic-blue/20 text-dynamic-blue hover:bg-dynamic-blue/20')}
            >
              <Check className="h-4 w-4" />
              {saveAttendanceMutation.isPending ? tCommon('saving') : tCommon('save')}
            </Button>
          </>
        }
      />
      {/* Calendar */}
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-bold">{format(currentDate, 'dd/MM/yyyy')}</CardTitle>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="secondary" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-foreground/60 font-semibold">{calendarMonth.getFullYear()} / {calendarMonth.toLocaleString(locale, { month: '2-digit' })}</div>
          <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {days.map((d, i) => (
                <div key={`d-${i}`} className="flex justify-center rounded bg-foreground/5 p-2 font-semibold md:rounded-lg">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {daysInMonth.map((day, idx) => {
                const available = isCurrentMonth(day) && isDateAvailable(sessions, day);
                const isSelected = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
                const base = 'flex justify-center rounded p-2 font-semibold md:rounded-lg';
                if (!available)
                  return (
                    <div key={`day-${idx}`} className={cn(base, 'cursor-default text-foreground/20 border border-transparent')}>
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
                      'border transition duration-300',
                      isSelected
                        ? 'border-dynamic-purple/40 bg-dynamic-purple/15 text-foreground'
                        : 'border-foreground/10 bg-foreground/10 text-foreground hover:bg-foreground/20'
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance List / Empty State */}
      <div className="space-y-4">


        {!isDateAvailable(sessions, currentDate) ? (
          <Card>
            <CardContent className="py-6 flex flex-col items-center justify-center gap-4">
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
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded bg-foreground/5 p-3">
                <div className="text-foreground/60 text-sm">{tAtt('summary_total')}</div>
                <div className="font-bold text-xl">{summary.total}</div>
              </div>
              <div className="rounded border-dynamic-green/30 bg-dynamic-green/10 p-3">
                <div className="text-dynamic-green text-sm">{tAtt('summary_present')}</div>
                <div className="font-bold text-xl">{summary.present}</div>
              </div>
              <div className="rounded border-dynamic-red/30 bg-dynamic-red/10 p-3">
                <div className="text-dynamic-red text-sm">{tAtt('summary_absent')}</div>
                <div className="font-bold text-xl">{summary.absent}</div>
              </div>
              <div className="rounded border-dynamic-orange/30 bg-dynamic-orange/10 p-3">
                <div className="text-dynamic-orange text-sm">{tAtt('summary_not_attended')}</div>
                <div className="font-bold text-xl">{summary.notAttended}</div>
              </div>
            </div>
          </CardContent>
        </Card>
          <div className="space-y-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {members.map((m) => {
              const entry = getEffectiveEntry(m.id);
              return (
                <div key={m.id} className="rounded border border-foreground/10 bg-foreground/5 p-3 flex flex-col justify-between gap-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={m.avatar_url ?? undefined} />
                        <AvatarFallback className="font-semibold">
                          {(m.display_name || m.full_name || '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{m.display_name || m.full_name || 'Unknown'}</div>
                        <div className="text-foreground/60 text-sm">{m.phone || tAtt('phone_fallback')}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        aria-pressed={entry.status === 'PRESENT'}
                        variant={entry.status === 'PRESENT' ? 'default' : 'secondary'}
                        className={cn(
                          'transition-colors',
                          entry.status === 'PRESENT' &&
                            'bg-dynamic-green/20 text-dynamic-green border-dynamic-green/30'
                        )}
                        onClick={() => toggleStatus(m.id, 'PRESENT')}
                      >
                        <span className="sr-only">{tAtt('present')}</span>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        aria-pressed={entry.status === 'ABSENT'}
                        variant={entry.status === 'ABSENT' ? 'default' : 'secondary'}
                        className={cn(
                          'transition-colors',
                          entry.status === 'ABSENT' &&
                            'bg-dynamic-red/20 text-dynamic-red border-dynamic-red/30'
                        )}
                        onClick={() => toggleStatus(m.id, 'ABSENT')}
                      >
                        <span className="sr-only">{tAtt('absent')}</span>
                        <UserX className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        aria-pressed={entry.status === 'LATE'}
                        variant={entry.status === 'LATE' ? 'default' : 'secondary'}
                        className={cn(
                          'transition-colors',
                          entry.status === 'LATE' &&
                            'bg-dynamic-orange/20 text-dynamic-orange border-dynamic-orange/30'
                        )}
                        onClick={() => toggleStatus(m.id, 'LATE')}
                      >
                        <span className="sr-only">{tAtt('late')}</span>
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="notes">{tAtt('notes_placeholder')}</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={entry.note || ''}
                      onChange={(e) => setLocalAttendance(m.id, { note: e.target.value })}
                      className="bg-card resize-none"
                      rows={1}
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


