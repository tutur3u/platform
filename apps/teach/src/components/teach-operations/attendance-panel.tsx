'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, RotateCcw, UserX, X } from '@tuturuuu/icons';
import {
  listWorkspaceCourseAttendance,
  listWorkspaceCourseAttendanceMonth,
  listWorkspaceCourseMembers,
  type TeachAttendanceEntry,
  type TeachAttendanceStatus,
  updateWorkspaceCourseAttendance,
  type WorkspaceCourseListItem,
} from '@tuturuuu/internal-api';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AttendanceCalendar } from './attendance-calendar';
import { AttendanceSchedulePanel } from './attendance-schedule-panel';
import {
  ATTENDANCE_STATUSES,
  getAttendanceSummary,
  parseIsoDate,
  pickInitialAttendanceDate,
  sessionsForDate,
  toMonthKey,
} from './attendance-utils';

const statusIcons = {
  ABSENT: UserX,
  LATE: Clock,
  PRESENT: Check,
} satisfies Record<(typeof ATTENDANCE_STATUSES)[number], typeof Check>;

export function AttendancePanel({
  course,
  wsId,
}: {
  course: WorkspaceCourseListItem;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const initialDate = pickInitialAttendanceDate(course.sessions);
  const [date, setDate] = useState(initialDate);
  const [monthDate, setMonthDate] = useState(() => parseIsoDate(initialDate));
  const [draft, setDraft] = useState<Record<string, TeachAttendanceEntry>>({});

  const membersQuery = useQuery({
    enabled: Boolean(course.id),
    queryFn: () => listWorkspaceCourseMembers(wsId, course.id),
    queryKey: ['teach-course-members', wsId, course.id],
  });
  const attendanceQuery = useQuery({
    enabled: Boolean(course.id && date),
    queryFn: () => listWorkspaceCourseAttendance(wsId, course.id, date),
    queryKey: ['teach-attendance', wsId, course.id, date],
  });
  const monthKey = toMonthKey(monthDate);
  const monthQuery = useQuery({
    enabled: Boolean(course.id && monthKey),
    queryFn: () =>
      listWorkspaceCourseAttendanceMonth(wsId, course.id, monthKey),
    queryKey: ['teach-attendance-month', wsId, course.id, monthKey],
  });

  const members = membersQuery.data?.data ?? [];
  const attendanceByUser = new Map(
    (attendanceQuery.data?.data ?? []).map((entry) => [entry.user_id, entry])
  );
  const selectedHasSession = sessionsForDate(course.sessions, date).length > 0;
  const userIds = members.map((member) => member.id);
  const summary = getAttendanceSummary(
    attendanceQuery.data?.data ?? [],
    userIds,
    draft
  );

  const saveAttendance = useMutation({
    mutationFn: () =>
      updateWorkspaceCourseAttendance(wsId, course.id, Object.values(draft)),
    onError: () => {
      toast.error(t('attendanceSaveError'));
    },
    onSuccess: () => {
      setDraft({});
      toast.success(t('attendanceSaved'));
      queryClient.invalidateQueries({
        queryKey: ['teach-attendance', wsId, course.id, date],
      });
      queryClient.invalidateQueries({
        queryKey: ['teach-attendance-month', wsId, course.id, monthKey],
      });
    },
  });

  const setActiveDate = (nextDate: string) => {
    setDate(nextDate);
    setDraft({});
  };

  const setDraftEntry = (
    userId: string,
    update: { notes?: string | null; status?: TeachAttendanceStatus }
  ) => {
    const base = attendanceByUser.get(userId);
    const current = draft[userId] ?? {
      date,
      notes: base?.notes ?? '',
      status: base?.status ?? 'NONE',
      user_id: userId,
    };
    setDraft((value) => ({
      ...value,
      [userId]: {
        ...current,
        date,
        notes: update.notes ?? current.notes ?? '',
        status: update.status ?? current.status,
      },
    }));
  };

  const getEffectiveEntry = (userId: string) =>
    draft[userId] ??
    attendanceByUser.get(userId) ?? {
      date,
      notes: '',
      status: 'NONE' as TeachAttendanceStatus,
      user_id: userId,
    };

  const resetDraft = () => setDraft({});
  const refreshCourses = () => {
    queryClient.invalidateQueries({ queryKey: ['teach-courses', wsId] });
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="space-y-5">
        <AttendanceCalendar
          date={date}
          endingDate={course.ending_date}
          memberCount={members.length}
          monthDate={monthDate}
          onDateChange={setActiveDate}
          onMonthChange={setMonthDate}
          sessions={course.sessions}
          startingDate={course.starting_date}
          summaries={monthQuery.data?.days ?? []}
        />
        <AttendanceSchedulePanel
          course={course}
          onSaved={refreshCourses}
          wsId={wsId}
        />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryTile label={t('summaryTotal')} value={summary.total} />
          <SummaryTile
            className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
            label={t('attendanceStatus.PRESENT')}
            value={summary.present}
          />
          <SummaryTile
            className="border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            label={t('attendanceStatus.ABSENT')}
            value={summary.absent}
          />
          <SummaryTile
            className="border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange"
            label={t('attendanceStatus.LATE')}
            value={summary.late}
          />
          <SummaryTile label={t('summaryUnset')} value={summary.notMarked} />
        </div>

        {selectedHasSession ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {members.map((member) => {
              const entry = getEffectiveEntry(member.id);
              const pending = Boolean(draft[member.id]);

              return (
                <article
                  className={cn(
                    'relative space-y-4 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]',
                    pending && 'border-dynamic-blue/50 bg-dynamic-blue/5'
                  )}
                  key={member.id}
                >
                  {pending ? (
                    <Badge className="absolute top-3 right-3 bg-dynamic-blue text-white">
                      {t('pending')}
                    </Badge>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-border">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {(
                          member.full_name ??
                          member.display_name ??
                          member.email ??
                          '?'
                        )
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-black">
                        {member.full_name ??
                          member.display_name ??
                          member.email}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {ATTENDANCE_STATUSES.map((status) => {
                      const Icon = statusIcons[status];
                      const active = entry.status === status;
                      return (
                        <Button
                          aria-pressed={active}
                          className={cn(
                            'h-auto flex-col gap-1 border-2 py-3',
                            status === 'PRESENT' &&
                              'border-dynamic-green/30 text-dynamic-green',
                            status === 'ABSENT' &&
                              'border-dynamic-red/30 text-dynamic-red',
                            status === 'LATE' &&
                              'border-dynamic-orange/30 text-dynamic-orange',
                            active &&
                              status === 'PRESENT' &&
                              'bg-dynamic-green/15',
                            active &&
                              status === 'ABSENT' &&
                              'bg-dynamic-red/15',
                            active &&
                              status === 'LATE' &&
                              'bg-dynamic-orange/15'
                          )}
                          key={status}
                          onClick={() =>
                            setDraftEntry(member.id, {
                              status: active ? 'NONE' : status,
                            })
                          }
                          type="button"
                          variant="ghost"
                        >
                          <Icon className="h-4 w-4" />
                          <span className="font-black text-xs">
                            {t(`attendanceStatus.${status}`)}
                          </span>
                        </Button>
                      );
                    })}
                  </div>

                  {entry.status !== 'NONE' ? (
                    <Button
                      className="w-full"
                      onClick={() =>
                        setDraftEntry(member.id, { status: 'NONE' })
                      }
                      type="button"
                      variant="outline"
                    >
                      <X className="h-4 w-4" />
                      {t('clearStatus')}
                    </Button>
                  ) : null}

                  <Textarea
                    className="min-h-20 border-2 border-border"
                    onChange={(event) =>
                      setDraftEntry(member.id, { notes: event.target.value })
                    }
                    placeholder={t('attendanceNotes')}
                    value={entry.notes ?? ''}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border-2 border-border border-dashed bg-muted/50 p-8 text-center">
            <p className="font-black text-2xl">{t('noSessionTitle')}</p>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
              {t('noSessionBody')}
            </p>
          </div>
        )}

        <div className="sticky bottom-4 flex flex-col gap-3 border-2 border-border bg-background p-3 shadow-[5px_5px_0_var(--border)] sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold text-sm">
            {t('pendingChanges', { count: Object.keys(draft).length })}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!Object.keys(draft).length || saveAttendance.isPending}
              onClick={resetDraft}
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-4 w-4" />
              {t('reset')}
            </Button>
            <Button
              disabled={!Object.keys(draft).length || saveAttendance.isPending}
              onClick={() => saveAttendance.mutate()}
              type="button"
            >
              <Check className="h-4 w-4" />
              {saveAttendance.isPending ? t('saving') : t('saveAttendance')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryTile({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: number;
}) {
  return (
    <div
      className={cn(
        'border-2 border-border bg-card p-3 text-center shadow-[2px_2px_0_var(--border)]',
        className
      )}
    >
      <p className="font-bold text-xs">{label}</p>
      <p className="font-black text-2xl">{value}</p>
    </div>
  );
}
