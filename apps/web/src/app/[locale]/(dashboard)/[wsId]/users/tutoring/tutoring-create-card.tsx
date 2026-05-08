'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus, X } from '@tuturuuu/icons';
import {
  listWorkspaceBasicUsers,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  findSessionSlotConflicts,
  getDisplayName,
  type TutoringFormValues,
} from './tutoring-types';

const DEFAULT_DURATION_MINUTES = 45;

interface Props {
  wsId: string;
  form: TutoringFormValues;
  groups: UserGroup[];
  isSubmitting: boolean;
  students: WorkspaceBasicUserRecord[];
  showTitle?: boolean;
  onChange: (next: TutoringFormValues) => void;
  onSubmit: () => void;
}

export function TutoringCreateCard({
  wsId,
  form,
  groups,
  isSubmitting,
  students,
  showTitle = true,
  onChange,
  onSubmit,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedStudentSearch] = useDebounce(studentSearch, 250);

  const studentsQuery = useInfiniteQuery({
    queryKey: ['tutoring-create-students', wsId, debouncedStudentSearch],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listWorkspaceBasicUsers(wsId, {
        from: pageParam,
        limit: 20,
        q: debouncedStudentSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      if (loadedCount >= (lastPage.count ?? 0) || lastPage.data.length < 20) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const queriedStudents = useMemo(() => {
    const pages = studentsQuery.data?.pages ?? [];
    const deduped = new Map<string, WorkspaceBasicUserRecord>();

    for (const page of pages) {
      for (const student of page.data ?? []) {
        if (!deduped.has(student.id)) {
          deduped.set(student.id, student);
        }
      }
    }

    return [...deduped.values()];
  }, [studentsQuery.data?.pages]);

  const groupOptions = useMemo<ComboboxOption[]>(
    () =>
      groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    [groups]
  );

  const studentOptions = useMemo<ComboboxOption[]>(() => {
    const options: ComboboxOption[] = [];
    const seen = new Set<string>();

    for (const student of queriedStudents) {
      if (seen.has(student.id)) {
        continue;
      }

      options.push({
        label: getDisplayName(student),
        value: student.id,
      });
      seen.add(student.id);
    }

    if (options.length === 0) {
      for (const student of students) {
        if (seen.has(student.id)) {
          continue;
        }

        options.push({
          label: getDisplayName(student),
          value: student.id,
        });
        seen.add(student.id);
      }
    }

    if (form.studentUserId && !seen.has(form.studentUserId)) {
      options.unshift({
        label: form.studentLabel || t('student'),
        value: form.studentUserId,
      });
      seen.add(form.studentUserId);
    }

    return options;
  }, [form.studentLabel, form.studentUserId, queriedStudents, students, t]);

  const teacherOptions = useMemo<ComboboxOption[]>(() => {
    const selectedGroup = groups.find((group) => group.id === form.groupId);
    const managers = selectedGroup?.managers ?? [];
    const options: ComboboxOption[] = [];
    const seen = new Set<string>();

    for (const manager of managers) {
      if (!manager.id || seen.has(manager.id)) {
        continue;
      }

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

  const singleTeacherId =
    teacherOptions.length === 1 ? teacherOptions[0]?.value : undefined;
  const slotConflicts = useMemo(() => findSessionSlotConflicts(form), [form]);
  const firstConflict = slotConflicts[0];
  const slotConflictMessage = useMemo(() => {
    if (!firstConflict) {
      return null;
    }

    const slotA = firstConflict.firstIndex + 1;
    const slotB = firstConflict.secondIndex + 1;

    if (firstConflict.conflictType === 'teacher') {
      return t('conflict_teacher_slots', { slotA, slotB });
    }

    return t('conflict_student_slots', { slotA, slotB });
  }, [firstConflict, t]);
  const hasRequiredFields = useMemo(() => {
    if (!form.groupId || !form.studentUserId || form.sessionSlots.length < 1) {
      return false;
    }

    return form.sessionSlots.every((slot) => {
      const hasDate = Boolean(slot.sessionDate);
      const hasTime = Boolean(slot.startTime);
      const hasTeacher = Boolean(slot.teacherUserId);
      const hasValidDuration =
        Number.isFinite(slot.durationMinutes) &&
        slot.durationMinutes >= 1 &&
        slot.durationMinutes <= 480;

      return hasDate && hasTime && hasTeacher && hasValidDuration;
    });
  }, [form]);

  return (
    <section className="space-y-3">
      {showTitle ? (
        <h3 className="font-semibold text-lg">{t('create_session')}</h3>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('group')}</Label>
          <Combobox
            options={groupOptions}
            selected={form.groupId}
            onChange={(value) => {
              const nextGroupId = value as string;
              const nextGroup = groups.find(
                (group) => group.id === nextGroupId
              );
              const managerIds = new Set(
                (nextGroup?.managers ?? [])
                  .map((manager) => manager.id)
                  .filter((managerId): managerId is string =>
                    Boolean(managerId)
                  )
              );
              const nextSingleTeacherId =
                managerIds.size === 1 ? [...managerIds][0] : undefined;

              onChange({
                ...form,
                groupId: nextGroupId,
                sessionSlots: form.sessionSlots.map((slot) => {
                  if (nextSingleTeacherId) {
                    return { ...slot, teacherUserId: nextSingleTeacherId };
                  }

                  return {
                    ...slot,
                    teacherUserId: managerIds.has(slot.teacherUserId)
                      ? slot.teacherUserId
                      : '',
                  };
                }),
              });
            }}
            placeholder={t('select_group')}
            searchPlaceholder={t('search_groups')}
            emptyText={t('no_groups')}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('student')}</Label>
          <Combobox
            options={studentOptions}
            selected={form.studentUserId}
            onChange={(value) => {
              const selectedValue = value as string;
              const selectedOption = studentOptions.find(
                (option) => option.value === selectedValue
              );

              onChange({
                ...form,
                studentUserId: selectedValue,
                studentLabel: selectedOption?.label || form.studentLabel,
              });
            }}
            placeholder={t('select_student')}
            searchPlaceholder={t('search_students')}
            emptyText={t('no_students')}
            onSearchChange={setStudentSearch}
            hasMore={Boolean(studentsQuery.hasNextPage)}
            loadingMore={studentsQuery.isFetchingNextPage}
            onLoadMore={() => {
              if (studentsQuery.hasNextPage) {
                void studentsQuery.fetchNextPage();
              }
            }}
          />
        </div>
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label>{t('session_slots')}</Label>
              <span className="text-muted-foreground text-sm">
                {form.sessionSlots.length}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...form,
                  sessionSlots: [
                    ...form.sessionSlots,
                    {
                      sessionDate: '',
                      startTime: '18:00',
                      durationMinutes: DEFAULT_DURATION_MINUTES,
                      teacherUserId: singleTeacherId ?? '',
                    },
                  ],
                })
              }
              disabled={form.sessionSlots.length >= 50}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('add_session_slot')}
            </Button>
          </div>

          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {form.sessionSlots.map((slot, index) => (
              <div
                key={`session-slot-${index + 1}`}
                className="relative rounded-lg border bg-muted/30 p-4"
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    onChange({
                      ...form,
                      sessionSlots:
                        form.sessionSlots.length > 1
                          ? form.sessionSlots.filter((_, i) => i !== index)
                          : form.sessionSlots,
                    })
                  }
                  disabled={form.sessionSlots.length <= 1}
                >
                  <X className="h-4 w-4" />
                </Button>

                <div className="grid gap-3 pt-1 pr-10 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label
                      htmlFor={`sessionDate-${index}`}
                      className="font-medium text-xs"
                    >
                      {t('date')}
                    </Label>
                    <Input
                      id={`sessionDate-${index}`}
                      type="date"
                      value={slot.sessionDate}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sessionSlots: form.sessionSlots.map((current, i) =>
                            i === index
                              ? { ...current, sessionDate: event.target.value }
                              : current
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`startTime-${index}`}
                      className="font-medium text-xs"
                    >
                      {t('time')}
                    </Label>
                    <Input
                      id={`startTime-${index}`}
                      type="time"
                      value={slot.startTime}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sessionSlots: form.sessionSlots.map((current, i) =>
                            i === index
                              ? { ...current, startTime: event.target.value }
                              : current
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`durationMinutes-${index}`}
                      className="font-medium text-xs"
                    >
                      {t('duration_minutes')}
                    </Label>
                    <Input
                      id={`durationMinutes-${index}`}
                      type="number"
                      min={1}
                      max={480}
                      step={1}
                      value={slot.durationMinutes}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          sessionSlots: form.sessionSlots.map((current, i) =>
                            i === index
                              ? {
                                  ...current,
                                  durationMinutes:
                                    Number.parseInt(event.target.value, 10) ||
                                    DEFAULT_DURATION_MINUTES,
                                }
                              : current
                          ),
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-3">
                    <Label className="font-medium text-xs">
                      {t('teacher')}
                    </Label>
                    <Combobox
                      options={teacherOptions}
                      selected={slot.teacherUserId}
                      onChange={(value) =>
                        onChange({
                          ...form,
                          sessionSlots: form.sessionSlots.map((current, i) =>
                            i === index
                              ? {
                                  ...current,
                                  teacherUserId: (value as string) || '',
                                }
                              : current
                          ),
                        })
                      }
                      placeholder={t('select_teacher')}
                      searchPlaceholder={t('search_teachers')}
                      emptyText={t('no_teachers')}
                      disabled={!form.groupId}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="content">{t('content')}</Label>
          <Textarea
            id="content"
            rows={3}
            value={form.content}
            onChange={(event) =>
              onChange({ ...form, content: event.target.value })
            }
          />
        </div>
        <Button
          className="md:col-span-2"
          onClick={onSubmit}
          disabled={
            isSubmitting || Boolean(firstConflict) || !hasRequiredFields
          }
        >
          {t('create')}
        </Button>
        {slotConflictMessage ? (
          <p className="text-destructive text-sm md:col-span-2">
            {slotConflictMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
