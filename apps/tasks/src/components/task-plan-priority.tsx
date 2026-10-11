'use client';

import {
  isTaskPriority,
  TaskPriorities,
  type TaskPriority,
} from '@tuturuuu/types/primitives/Priority';
import { useTranslations } from 'next-intl';

export function TaskPlanPriority({
  value,
  onChange,
}: {
  value: TaskPriority | null;
  onChange: (value: TaskPriority | null) => void;
}) {
  const t = useTranslations('task-plan');
  return (
    <label className="block space-y-2">
      {t('priority')}
      <select
        className="w-full rounded-md border border-input bg-background p-2"
        value={value ?? ''}
        onChange={(event) => {
          const value = event.target.value;
          if (value === '' || isTaskPriority(value)) onChange(value || null);
        }}
      >
        <option value="">{t('priorityUnspecified')}</option>
        {TaskPriorities.map((priority) => (
          <option key={priority} value={priority}>
            {t(`priorityOptions.${priority}`)}
          </option>
        ))}
      </select>
      <p className="text-muted-foreground text-sm">{t('priorityHint')}</p>
    </label>
  );
}
