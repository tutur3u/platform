'use client';

import { useQuery } from '@tanstack/react-query';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
import {
  rankTutoringDraftChoices,
  suggestTutoringSlots,
} from '@tuturuuu/internal-api/tutoring-suggestion';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { addDaysToIsoDate } from './tutoring-filters';
import { loadTutoringPlanData } from './tutoring-plan-data';
import type { TutoringFormValues } from './tutoring-types';
import { useTutoringHandoff } from './use-tutoring-handoff';

export function TutoringDraftChoices({
  wsId,
  form,
  policy,
  today,
  schedule,
  missingCount = 0,
  scheduleLoading = false,
  scheduleError = false,
  onRetrySchedule,
  onChange,
}: {
  wsId: string;
  form: TutoringFormValues;
  policy: TutoringPolicy;
  today: string;
  schedule: WorkspaceUserGroupSession[];
  missingCount?: number;
  scheduleLoading?: boolean;
  scheduleError?: boolean;
  onRetrySchedule?: () => void;
  onChange: (form: TutoringFormValues) => void;
}) {
  const t = useTranslations('ws-tutoring');
  const locale = useLocale();
  const lease = useTutoringHandoff(wsId, true);
  const queryScope = useMemo(
    () => ({ scope: lease.scope, id: crypto.randomUUID() }),
    [lease.scope]
  ).id;
  const end = addDaysToIsoDate(today, policy.schedulingHorizonDays);
  const missingAbsenceDate =
    form.reasonType === 'ABSENT_RECOVERY' && !form.missedClassDate;
  const data = useQuery({
    queryKey: [
      'tutoring-draft-data',
      wsId,
      lease.scope.actor?.actorId,
      queryScope,
      today,
      end,
    ],
    enabled: Boolean(
      lease.scope.actor &&
        form.groupId &&
        form.studentUserId &&
        schedule.length &&
        !missingAbsenceDate
    ),
    queryFn: () =>
      loadTutoringPlanData(
        wsId,
        addDaysToIsoDate(today, -1),
        end,
        lease.begin()
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (!form.groupId || !form.studentUserId) return null;
  const suggestions =
    form.reasonType === 'WEAK_SUPPORT'
      ? schedule
          .flatMap((session) =>
            suggestTutoringSlots(
              [session],
              addDaysToIsoDate(today, -1),
              Math.min(50, form.sessionSlots.length),
              policy,
              'consecutive'
            )
          )
          .slice(0, 50)
      : suggestTutoringSlots(
          schedule,
          form.missedClassDate || addDaysToIsoDate(today, -1),
          50,
          policy
        );
  let message = missingAbsenceDate
    ? t('plan_choose_missed_date')
    : scheduleLoading
      ? t('plan_loading')
      : scheduleError
        ? t('schedule_load_failed')
        : !schedule.length
          ? missingCount
            ? t('plan_missing_schedule', { count: missingCount })
            : t('plan_no_schedule', { days: policy.schedulingHorizonDays })
          : data.isError
            ? t('plan_incomplete')
            : data.isFetching || !data.data
              ? t('plan_loading')
              : !data.data.teachers.length
                ? t('plan_no_teachers')
                : '';
  const apply = (
    index: number,
    choice: ReturnType<typeof rankTutoringDraftChoices>[number],
    teacherId: string
  ) => {
    const current = lease.begin();
    if (
      !current() ||
      !data.data ||
      data.isFetching ||
      !choice.teachers.some((teacher) => teacher.id === teacherId)
    )
      return;
    onChange({
      ...form,
      sessionSlots: form.sessionSlots.map((slot, slotIndex) =>
        slotIndex === index
          ? {
              durationMinutes: choice.durationMinutes ?? policy.durationMinutes,
              sessionDate: choice.sessionDate,
              startTime: choice.startTime,
              teacherUserId: teacherId,
            }
          : slot
      ),
    });
  };
  const rows = form.sessionSlots.map((_, index) => {
    const draft = form.sessionSlots
      .filter(
        (_, slotIndex) =>
          slotIndex !== index &&
          form.sessionSlots[slotIndex]?.sessionDate &&
          form.sessionSlots[slotIndex]?.startTime
      )
      .map((slot) => ({
        session_date: slot.sessionDate,
        start_time: slot.startTime,
        duration_minutes: slot.durationMinutes,
        teacher_user_id: slot.teacherUserId || null,
        student_user_id: form.studentUserId,
        attendance_status: 'PENDING' as const,
      }));
    return data.data
      ? rankTutoringDraftChoices({
          suggestions,
          teachers: data.data.teachers,
          sessions: [...data.data.sessions, ...draft],
          studentId: form.studentUserId,
          fromDate: today,
          toDate: end,
        }).slice(0, 3)
      : [];
  });
  if (!message && rows.every((choices) => !choices.length))
    message = t('plan_no_choices');
  return (
    <section
      aria-label={t('plan_title')}
      className="space-y-2 rounded-lg border px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{t('plan_title')}</h3>
        {(data.isError || scheduleError) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              scheduleError ? onRetrySchedule?.() : void data.refetch()
            }
          >
            {t('retry')}
          </Button>
        )}
      </div>
      {message ? (
        <p
          role={data.isError || scheduleError ? 'alert' : 'status'}
          className="text-muted-foreground text-xs"
        >
          {message}
        </p>
      ) : (
        rows.map((choices, index) => (
          <div className="space-y-1 border-t pt-2" key={`plan-${index}`}>
            <span className="text-muted-foreground text-xs">
              {t('session_number', { index: index + 1 })}
            </span>
            {choices.map((choice) => (
              <div
                className="flex flex-wrap items-center gap-1"
                key={`${choice.sessionDate}:${choice.startTime}`}
              >
                <span className="mr-1 text-xs tabular-nums">
                  {choice.sessionDate} · {choice.startTime} ·{' '}
                  {choice.durationMinutes}m
                  <span className="ml-1 text-muted-foreground">
                    {t('plan_class_time', { time: choice.classStartsAt })}
                  </span>
                </span>
                {choice.teachers.slice(0, 5).map((teacher) => (
                  <Button
                    key={teacher.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => apply(index, choice, teacher.id)}
                  >
                    {teacher.display_name || teacher.full_name || t('teacher')}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
      {!schedule.length && (
        <Link
          className="text-sm underline underline-offset-4"
          href={`/${locale}/${wsId}/users/groups/${form.groupId}/schedule`}
        >
          {t('plan_schedule')}
        </Link>
      )}
      {data.data && !data.data.teachers.length && (
        <Link
          className="text-sm underline underline-offset-4"
          href={`/${locale}/${wsId}/users/groups`}
        >
          {t('plan_teacher_roles')}
        </Link>
      )}
      {rows.some((choices) =>
        choices.some((choice) => choice.teachers.length > 5)
      ) && (
        <p className="text-muted-foreground text-xs">
          {t('plan_more_teachers', { count: 5 })}
        </p>
      )}
      {!message && (
        <p className="text-muted-foreground text-xs">{t('plan_limits')}</p>
      )}
    </section>
  );
}
