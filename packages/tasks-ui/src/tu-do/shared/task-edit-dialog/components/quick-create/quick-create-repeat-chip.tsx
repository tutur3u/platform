'use client';

import { Repeat } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { buildTaskRecurrenceSchedule } from '../../../task-recurrence/task-recurrence-choice';
import {
  formatTaskRecurrenceSummary,
  type TaskRecurrenceTranslator,
} from '../../../task-recurrence/task-recurrence-labels';
import { TaskRecurrencePicker } from '../../../task-recurrence/task-recurrence-picker';
import type { QuickCreateRepeatModel } from '../../../task-recurrence/use-quick-create-recurrence';
import { QuickCreateChip } from './quick-create-chip';

interface QuickCreateRepeatChipProps {
  repeat: QuickCreateRepeatModel;
  emptyValue: string;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The last quick-create property: Daily, Weekdays, Weekly, Monthly or a
 * custom rule, summarized on the chip. */
export function QuickCreateRepeatChip({
  repeat,
  emptyValue,
  open,
  disabled,
  onOpenChange,
}: QuickCreateRepeatChipProps) {
  const t = useTranslations(
    'ws-task-boards.recurrence'
  ) as TaskRecurrenceTranslator;
  const { choice, timing, locale } = repeat;
  const summary = useMemo(() => {
    if (!choice) return null;
    const result = buildTaskRecurrenceSchedule(choice, timing);
    return result.ok
      ? formatTaskRecurrenceSummary(result.schedule, t, locale)
      : t(choice.preset);
  }, [choice, timing, t, locale]);

  return (
    <QuickCreateChip
      id="repeat"
      icon={Repeat}
      label={t('repeat')}
      value={summary}
      emptyValue={emptyValue}
      open={open}
      disabled={disabled}
      onOpenChange={onOpenChange}
      contentClassName="w-72"
    >
      <TaskRecurrencePicker
        choice={choice}
        timing={timing}
        locale={locale}
        onChange={repeat.onChange}
        onDone={() => onOpenChange(false)}
      />
    </QuickCreateChip>
  );
}
