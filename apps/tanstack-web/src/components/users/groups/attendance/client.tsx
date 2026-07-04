'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from '@tuturuuu/icons';
import {
  getWorkspaceUserGroupAttendanceShowManagers,
  listWorkspaceUserGroupAttendance,
  listWorkspaceUserGroupAttendanceMembers,
  listWorkspaceUserGroupSessions,
  saveWorkspaceUserGroupAttendance,
} from '@tuturuuu/internal-api';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { format, parse } from 'date-fns';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AttendanceCalendarCard } from './attendance-calendar-card';
import { AttendanceMemberCard } from './attendance-member-card';
import { AttendanceMemberSkeleton } from './attendance-member-skeleton';
import { AttendanceSaveBar } from './attendance-save-bar';
import { AttendanceSessionCard } from './attendance-session-card';
import { AttendanceSummaryCards } from './attendance-summary-cards';
import {
  getAttendanceSessionRange,
  groupSessionsByDate,
  toAttendanceMap,
} from './attendance-utils';
import type {
  AttendanceEntry,
  AttendanceMap,
  AttendanceMember,
  AttendanceStatus,
  GroupAttendanceClientProps,
} from './types';

type PendingAttendance = {
  note?: string | null;
  status?: AttendanceStatus;
  user_id: string;
};

export function GroupAttendanceClient({
  canUpdateAttendance,
  endingDate,
  groupId,
  initialAttendance = {},
  initialDate,
  initialMembers,
  initialSessionId,
  initialSessions,
  initialShowManagers,
  startingDate,
  wsId,
}: GroupAttendanceClientProps) {
  const queryClient = useQueryClient();
  const tAtt = useTranslations('ws-user-group-attendance');
  const [dateStr, setDateStr] = useQueryState(
    'date',
    parseAsString.withDefault(initialDate)
  );
  const [sessionId, setSessionId] = useQueryState(
    'session',
    parseAsString.withDefault(initialSessionId ?? '')
  );
  const currentDate = useMemo(
    () => parse(dateStr, 'yyyy-MM-dd', new Date()),
    [dateStr]
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  );
  const sessionRange = useMemo(
    () => getAttendanceSessionRange(format(currentDate, 'yyyy-MM-dd')),
    [currentDate]
  );

  const { data: sessions = initialSessions } = useQuery({
    initialData: initialSessions,
    queryFn: async () => {
      const response = await listWorkspaceUserGroupSessions(wsId, {
        from: sessionRange.from,
        groupId,
        to: sessionRange.to,
      });
      return response.data;
    },
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
    staleTime: 60 * 1000,
  });

  const sessionsByDate = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions]
  );
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

  const { data: allMembers = initialMembers } = useQuery<AttendanceMember[]>({
    initialData: initialMembers,
    queryFn: async () => {
      const response = await listWorkspaceUserGroupAttendanceMembers(
        wsId,
        groupId,
        { limit: 1000, offset: 0 }
      );
      return response.data as AttendanceMember[];
    },
    queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'members'],
    staleTime: 60 * 1000,
  });

  const { data: showManagers = initialShowManagers } = useQuery({
    initialData: initialShowManagers,
    queryFn: () => getWorkspaceUserGroupAttendanceShowManagers(wsId),
    queryKey: ['workspace-config', wsId, 'ATTENDANCE_SHOW_MANAGERS'],
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(() => {
    if (showManagers) {
      return allMembers;
    }
    return allMembers.filter((member) => member.role !== 'TEACHER');
  }, [allMembers, showManagers]);

  const attendanceDate = format(currentDate, 'yyyy-MM-dd');
  const attendanceKey = [
    'workspaces',
    wsId,
    'users',
    'groups',
    groupId,
    'attendance',
    attendanceDate,
    activeSessionId ?? 'legacy',
  ] as const;

  const { data: attendance = {}, isLoading: isLoadingAttendance } =
    useQuery<AttendanceMap>({
      initialData:
        attendanceDate === initialDate &&
        (activeSessionId ?? null) === (initialSessionId ?? null)
          ? initialAttendance
          : undefined,
      queryFn: async () => {
        const rows = await listWorkspaceUserGroupAttendance(wsId, groupId, {
          date: attendanceDate,
          sessionId: activeSessionId,
        });
        return toAttendanceMap(rows, activeSessionId);
      },
      queryKey: attendanceKey,
      staleTime: 60 * 1000,
    });

  const [pendingMap, setPendingMap] = useState<Map<string, PendingAttendance>>(
    new Map()
  );
  const attendanceScope = `${attendanceDate}:${activeSessionId ?? 'legacy'}`;
  useEffect(() => {
    if (!attendanceScope) {
      return;
    }

    setPendingMap(new Map());
    setCalendarMonth(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    );
  }, [attendanceScope, currentDate]);

  const getEffectiveEntry = useCallback(
    (userId: string): AttendanceEntry => {
      const base = attendance[userId] || {
        note: '',
        status: 'NONE' as AttendanceStatus,
      };
      const pending = pendingMap.get(userId);
      return {
        note: (pending?.note ?? base.note) || '',
        status: pending?.status ?? base.status,
      };
    },
    [attendance, pendingMap]
  );

  const setLocalAttendance = (
    userId: string,
    update: { note?: string | null; status?: AttendanceStatus }
  ) => {
    const previous =
      queryClient.getQueryData<Record<string, AttendanceEntry>>(
        attendanceKey
      ) || {};
    const current = previous[userId] || {
      note: '',
      status: 'NONE' as AttendanceStatus,
    };
    queryClient.setQueryData(attendanceKey, {
      ...previous,
      [userId]: {
        note: (update.note ?? current.note) || '',
        status: update.status ?? current.status,
      },
    });

    setPendingMap((previousPending) => {
      const draft = new Map(previousPending);
      const existing = draft.get(userId) || { user_id: userId };
      const merged: PendingAttendance = { ...existing };
      if (update.status !== undefined) {
        merged.status = update.status;
      }
      if (update.note !== undefined) {
        merged.note = update.note ?? '';
      }

      const serverState = {
        note: attendance[userId]?.note ?? '',
        status: attendance[userId]?.status ?? 'NONE',
      };
      const effectiveAfter = {
        note: merged.note ?? serverState.note,
        status: merged.status ?? serverState.status,
      };

      if (
        effectiveAfter.status === serverState.status &&
        (effectiveAfter.note || '') === (serverState.note || '')
      ) {
        draft.delete(userId);
      } else {
        draft.set(userId, { ...merged, user_id: userId });
      }

      return draft;
    });
  };

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      const payload = Array.from(pendingMap.values()).map((pending) => {
        const base = attendance[pending.user_id] || {
          note: '',
          status: 'NONE' as AttendanceStatus,
        };
        return {
          date: attendanceDate,
          notes: pending.note ?? base.note ?? '',
          session_id: activeSessionId,
          status: pending.status ?? base.status,
          user_id: pending.user_id,
        };
      });

      await saveWorkspaceUserGroupAttendance(wsId, groupId, payload);
    },
    onError: () => {
      toast.error('Failed to update attendance');
    },
    onSuccess: async () => {
      setPendingMap(new Map());
      await queryClient.invalidateQueries({ queryKey: attendanceKey });
      toast.success('Attendance updated successfully');
    },
  });

  const summary = useMemo(() => {
    const result = {
      absent: 0,
      late: 0,
      notAttended: 0,
      present: 0,
      total: members.length,
    };

    for (const member of members) {
      const entry = getEffectiveEntry(member.id);
      if (entry.status === 'PRESENT') {
        result.present += 1;
      } else if (entry.status === 'ABSENT') {
        result.absent += 1;
      } else if (entry.status === 'LATE') {
        result.late += 1;
      }
    }

    result.notAttended =
      result.total - result.present - result.absent - result.late;
    return result;
  }, [members, getEffectiveEntry]);

  const handleReset = async () => {
    setPendingMap(new Map());
    await queryClient.invalidateQueries({ queryKey: attendanceKey });
  };

  const handleSave = async () => {
    if (pendingMap.size === 0) {
      toast.info('No changes to save');
      return;
    }
    await saveAttendanceMutation.mutateAsync();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <AttendanceSaveBar
        isSaving={saveAttendanceMutation.isPending}
        onReset={handleReset}
        onSave={handleSave}
        pendingCount={pendingMap.size}
      />
      <AttendanceCalendarCard
        calendarMonth={calendarMonth}
        currentDate={currentDate}
        endingDate={endingDate}
        onCalendarMonthChange={setCalendarMonth}
        onDateChange={(value) => void setDateStr(value)}
        onSessionChange={(value) => void setSessionId(value)}
        sessionsByDate={sessionsByDate}
        startingDate={startingDate}
      />
      <div className="space-y-4 lg:col-span-2">
        <AttendanceSessionCard
          activeSessionId={activeSessionId}
          currentDateSessions={currentDateSessions}
          groupId={groupId}
          onSessionChange={(value) => void setSessionId(value)}
          wsId={wsId}
        />
        <AttendanceSummaryCards {...summary} />
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
            ? Array.from({ length: 4 }).map((_, index) => (
                <AttendanceMemberSkeleton
                  key={`attendance-skeleton-${index}`}
                />
              ))
            : members.map((member) => (
                <AttendanceMemberCard
                  canUpdateAttendance={canUpdateAttendance}
                  entry={getEffectiveEntry(member.id)}
                  hasPendingChanges={pendingMap.has(member.id)}
                  key={member.id}
                  member={member}
                  onNoteChange={(userId, note) =>
                    setLocalAttendance(userId, { note })
                  }
                  onStatusToggle={(userId, status) => {
                    const current = getEffectiveEntry(userId).status;
                    setLocalAttendance(userId, {
                      status: current === status ? 'NONE' : status,
                    });
                  }}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
