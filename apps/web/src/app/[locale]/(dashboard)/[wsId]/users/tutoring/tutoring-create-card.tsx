'use client';

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

interface Props {
  form: TutoringFormValues;
  groups: UserGroup[];
  isSubmitting: boolean;
  students: WorkspaceBasicUserRecord[];
  onChange: (next: TutoringFormValues) => void;
  onSubmit: () => void;
}

export function TutoringCreateCard({
  form,
  groups,
  isSubmitting,
  students,
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

  const studentOptions = useMemo<ComboboxOption[]>(
    () =>
      students.map((student) => ({
        label: `${getDisplayName(student)} (${student.id})`,
        value: student.id,
      })),
    [students]
  );

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-lg">{t('create_session')}</h3>
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
        <div>
          <Label htmlFor="sessionDate">{t('date')}</Label>
          <Input
            id="sessionDate"
            type="date"
            value={form.sessionDate}
            onChange={(event) =>
              onChange({ ...form, sessionDate: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="startTime">{t('time')}</Label>
          <Input
            id="startTime"
            type="time"
            value={form.startTime}
            onChange={(event) =>
              onChange({ ...form, startTime: event.target.value })
            }
          />
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
