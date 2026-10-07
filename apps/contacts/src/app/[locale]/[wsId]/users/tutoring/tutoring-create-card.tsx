'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Loader2, TriangleAlert } from '@tuturuuu/icons';
import type {
  TutoringReasonType,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { listWorkspaceUserGroupSessions } from '@tuturuuu/internal-api';
import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
import { suggestTutoringSlots } from '@tuturuuu/internal-api/tutoring-suggestion';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { TutoringCreateSlots } from './tutoring-create-slots';
import { addDaysToIsoDate, toIsoDate } from './tutoring-filters';
import { WorkspacePersonPicker } from './tutoring-people-picker';
import {
  findSessionSlotConflicts,
  getConflictingSlotIndexes,
  getDisplayName,
  type TutoringFormValues,
} from './tutoring-types';

const REASON_TYPES: TutoringReasonType[] = [
  'ABSENT_RECOVERY',
  'WEAK_SUPPORT',
  'CUSTOM',
];

interface Props {
  form: TutoringFormValues;
  groups: UserGroup[];
  isSubmitting: boolean;
  students: WorkspaceBasicUserRecord[];
  onChange: (next: TutoringFormValues) => void;
  onSubmit: () => void;
  policy: TutoringPolicy;
  wsId: string;
}

export function TutoringCreateCard({
  form,
  groups,
  isSubmitting,
  students,
  onChange,
  onSubmit,
  policy,
  wsId,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const missedDate = form.missedClassDate ?? '';
  const [scheduleMessage, setScheduleMessage] = useState('');
  const today = toIsoDate(new Date());
  const classSchedule = useQuery({
    enabled: Boolean(
      form.groupId &&
        (form.reasonType === 'WEAK_SUPPORT' ||
          (form.reasonType === 'ABSENT_RECOVERY' && missedDate))
    ),
    queryKey: [
      'tutoring-class-schedule',
      wsId,
      form.groupId,
      today,
      policy.schedulingHorizonDays,
    ],
    queryFn: () =>
      listWorkspaceUserGroupSessions(wsId, {
        from: today,
        groupId: form.groupId,
        to: addDaysToIsoDate(today, policy.schedulingHorizonDays),
      }),
    staleTime: 5 * 60_000,
  });

  const groupOptions = useMemo<ComboboxOption[]>(
    () =>
      groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    [groups]
  );

  const teacherOptions = useMemo<ComboboxOption[]>(() => {
    const managers =
      groups.find((group) => group.id === form.groupId)?.managers ?? [];
    const options: ComboboxOption[] = [];
    const seen = new Set<string>();

    for (const manager of managers) {
      if (!manager.id || seen.has(manager.id)) continue;
      options.push({
        label:
          manager.full_name ||
          manager.display_name ||
          manager.email ||
          manager.id,
        value: manager.id,
      });
      seen.add(manager.id);
    }

    return options;
  }, [form.groupId, groups]);

  /**
   * The queue hand-off prefills a student that the search page may not contain
   * yet, so keep its label selectable until the picker loads that person.
   */
  const studentExtraOptions = useMemo<ComboboxOption[]>(() => {
    if (!form.studentUserId) return [];

    const known = students.find((student) => student.id === form.studentUserId);

    return [
      {
        label: known
          ? getDisplayName(known)
          : form.studentLabel || t('student'),
        value: form.studentUserId,
      },
    ];
  }, [form.studentLabel, form.studentUserId, students, t]);

  const conflictingIndexes = useMemo(
    () => getConflictingSlotIndexes(form),
    [form]
  );
  const firstConflict = useMemo(
    () => findSessionSlotConflicts(form)[0],
    [form]
  );
  const conflictMessage = firstConflict
    ? firstConflict.conflictType === 'teacher'
      ? t('conflict_teacher_slots', {
          slotA: firstConflict.firstIndex + 1,
          slotB: firstConflict.secondIndex + 1,
        })
      : t('conflict_student_slots', {
          slotA: firstConflict.firstIndex + 1,
          slotB: firstConflict.secondIndex + 1,
        })
    : null;

  const hasRequiredFields = useMemo(() => {
    if (!form.groupId || !form.studentUserId || form.sessionSlots.length < 1) {
      return false;
    }

    return form.sessionSlots.every(
      (slot) =>
        Boolean(slot.sessionDate) &&
        Boolean(slot.startTime) &&
        Boolean(slot.teacherUserId) &&
        Number.isFinite(slot.durationMinutes) &&
        slot.durationMinutes >= 1 &&
        slot.durationMinutes <= 480
    );
  }, [form]);

  const reasonLabels: Record<TutoringReasonType, string> = {
    ABSENT_RECOVERY: t('absent_recovery'),
    CUSTOM: t('custom_reason'),
    WEAK_SUPPORT: t('weak_support'),
  };

  return (
    <section className="space-y-4">
      <p className="text-muted-foreground text-sm">{t('creation_steps')}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{t('group')}</Label>
          <Combobox
            emptyText={t('no_groups')}
            onChange={(value) => {
              const nextGroupId = value as string;

              onChange({
                ...form,
                groupId: nextGroupId,
                missedClassDate: '',
                sourceFeedbackId: null,
              });
            }}
            options={groupOptions}
            placeholder={t('select_group')}
            searchPlaceholder={t('search_groups')}
            selected={form.groupId}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('student')}</Label>
          <WorkspacePersonPicker
            emptyText={t('no_students')}
            extraOptions={studentExtraOptions}
            onChange={(value, option) =>
              onChange({
                ...form,
                sourceFeedbackId: null,
                studentLabel: option?.label || form.studentLabel,
                studentUserId: value,
                missedClassDate: '',
              })
            }
            placeholder={t('select_student')}
            searchPlaceholder={t('search_students')}
            value={form.studentUserId}
            wsId={wsId}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('reason')}</Label>
          <Combobox
            emptyText={t('no_reasons')}
            onChange={(value) =>
              onChange({ ...form, reasonType: value as TutoringReasonType })
            }
            options={REASON_TYPES.map((reason) => ({
              label: reasonLabels[reason],
              value: reason,
            }))}
            placeholder={t('reason')}
            searchPlaceholder={t('reason')}
            selected={form.reasonType}
          />
        </div>
      </div>

      <div className="rounded-lg bg-muted/30 p-3 text-sm">
        <span className="font-medium">{t('homeroom_teacher')}: </span>
        {teacherOptions.map((option) => option.label).join(', ') ||
          t('homeroom_unassigned')}
        <p className="mt-1 text-muted-foreground">
          {t('tutoring_teacher_help')}
        </p>
      </div>

      {form.reasonType !== 'CUSTOM' ? (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div>
            <h3 className="font-semibold text-sm">{t('suggestion_title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('suggestion_description')}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {form.reasonType === 'ABSENT_RECOVERY' ? (
              <div className="min-w-40 flex-1 space-y-1">
                <Label htmlFor="missed-class-date">
                  {t('missed_class_date')}
                </Label>
                <Input
                  id="missed-class-date"
                  max={today}
                  onChange={(event) => {
                    onChange({ ...form, missedClassDate: event.target.value });
                    setScheduleMessage('');
                  }}
                  type="date"
                  value={missedDate}
                />
                <p className="text-muted-foreground text-xs">
                  {t('missed_class_date_default_hint')}
                </p>
              </div>
            ) : null}
            <Button
              disabled={
                !form.groupId ||
                (form.reasonType === 'ABSENT_RECOVERY' && !missedDate) ||
                classSchedule.isFetching ||
                (!classSchedule.isSuccess && !classSchedule.isError)
              }
              onClick={() => {
                if (classSchedule.isError) {
                  void classSchedule.refetch();
                  return;
                }
                const suggestions = suggestTutoringSlots(
                  classSchedule.data?.data ?? [],
                  form.reasonType === 'ABSENT_RECOVERY'
                    ? missedDate
                    : addDaysToIsoDate(today, -1),
                  form.sessionSlots.length,
                  policy,
                  form.reasonType === 'WEAK_SUPPORT'
                    ? 'consecutive'
                    : 'separate'
                );
                if (suggestions.length !== form.sessionSlots.length) {
                  setScheduleMessage(t('suggestion_unavailable'));
                  return;
                }
                onChange({
                  ...form,
                  sessionSlots: form.sessionSlots.map((slot, index) => ({
                    ...slot,
                    durationMinutes:
                      suggestions[index]?.durationMinutes ??
                      policy.durationMinutes,
                    sessionDate:
                      suggestions[index]?.sessionDate ?? slot.sessionDate,
                    startTime: suggestions[index]?.startTime ?? slot.startTime,
                  })),
                });
                setScheduleMessage(
                  t('smart_suggestion_applied', { count: suggestions.length })
                );
              }}
              type="button"
              variant="outline"
            >
              {classSchedule.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              {t('suggest_all_sessions')}
            </Button>
          </div>
          {classSchedule.isError ? (
            <p className="text-destructive text-sm">
              {t('schedule_load_failed')}
            </p>
          ) : scheduleMessage ? (
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {scheduleMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <TutoringCreateSlots
        conflictingIndexes={conflictingIndexes}
        form={form}
        onChange={onChange}
        teacherOptions={teacherOptions}
        wsId={wsId}
      />

      <div className="space-y-2">
        <Label htmlFor="content">{t('content')}</Label>
        <p className="text-muted-foreground text-xs">
          {t(
            form.reasonType === 'WEAK_SUPPORT'
              ? 'content_rule_weak'
              : 'content_rule_absent'
          )}
        </p>
        <Textarea
          id="content"
          onChange={(event) =>
            onChange({ ...form, content: event.target.value })
          }
          placeholder={t('content_placeholder')}
          rows={3}
          value={form.content}
        />
      </div>

      {conflictMessage ? (
        <p className="flex items-center gap-2 rounded-lg border border-dynamic-red/25 bg-dynamic-red/10 p-3 text-dynamic-red text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {conflictMessage}
        </p>
      ) : null}

      <Button
        className="w-full"
        disabled={isSubmitting || Boolean(firstConflict) || !hasRequiredFields}
        onClick={onSubmit}
        size="lg"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" />
        )}
        {form.sessionSlots.length > 1
          ? t('create_multiple', { count: form.sessionSlots.length })
          : t('create')}
      </Button>
    </section>
  );
}
