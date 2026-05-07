'use client';

import { Plus, X } from '@tuturuuu/icons';
import type { WorkspaceBasicUserRecord } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { getDisplayName, type TutoringFormValues } from './tutoring-types';

const DEFAULT_DURATION_MINUTES = 45;

interface Props {
  form: TutoringFormValues;
  groups: UserGroup[];
  isSubmitting: boolean;
  students: WorkspaceBasicUserRecord[];
  showTitle?: boolean;
  onChange: (next: TutoringFormValues) => void;
  onSubmit: () => void;
}

export function TutoringCreateCard({
  form,
  groups,
  isSubmitting,
  students,
  showTitle = true,
  onChange,
  onSubmit,
}: Props) {
  const t = useTranslations('ws-tutoring');

  const groupOptions = useMemo<ComboboxOption[]>(
    () =>
      groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    [groups]
  );

  const studentOptions = useMemo<ComboboxOption[]>(() => {
    const options = students.map((student) => ({
      label: `${getDisplayName(student)} (${student.id})`,
      value: student.id,
    }));

    if (
      form.studentUserId &&
      !options.some((option) => option.value === form.studentUserId)
    ) {
      options.unshift({
        label: form.studentUserId,
        value: form.studentUserId,
      });
    }

    return options;
  }, [form.studentUserId, students]);

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
            onChange={(value) =>
              onChange({ ...form, groupId: value as string })
            }
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
            onChange={(value) =>
              onChange({ ...form, studentUserId: value as string })
            }
            placeholder={t('select_student')}
            searchPlaceholder={t('search_students')}
            emptyText={t('no_students')}
          />
        </div>
        <div className="space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label>{t('session_slots')}</Label>
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

          <div className="space-y-2">
            {form.sessionSlots.map((slot, index) => (
              <div
                key={`session-slot-${index + 1}`}
                className="grid gap-2 rounded-md border border-border/60 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <div>
                  <Label htmlFor={`sessionDate-${index}`}>{t('date')}</Label>
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

                <div>
                  <Label htmlFor={`startTime-${index}`}>{t('time')}</Label>
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

                <div>
                  <Label htmlFor={`durationMinutes-${index}`}>
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

                <div className="flex items-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
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
          disabled={isSubmitting}
        >
          {t('create')}
        </Button>
      </div>
    </section>
  );
}
