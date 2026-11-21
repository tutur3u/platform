'use client';

import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export type TaskRecurrenceEditScope = 'only_this' | 'following';

interface TaskRecurrenceScopePromptProps {
  pending?: boolean;
  onApply: (scope: TaskRecurrenceEditScope) => void;
}

/** Shown when a task's fields differ from its series template. "Only this
 * task" is the default and keeps the edit local; "This and following tasks"
 * copies the task's fields into the series. */
export function TaskRecurrenceScopePrompt({
  pending = false,
  onApply,
}: TaskRecurrenceScopePromptProps) {
  const t = useTranslations('ws-task-boards.recurrence');
  const id = useId();
  const [scope, setScope] = useState<TaskRecurrenceEditScope>('only_this');

  return (
    <fieldset
      aria-live="polite"
      className="mt-2 space-y-2 rounded-lg border p-3"
      data-testid="task-recurrence-scope-prompt"
    >
      <legend className="px-1 font-medium text-muted-foreground text-xs">
        {t('scope_title')}
      </legend>
      <RadioGroup
        value={scope}
        onValueChange={(value) => setScope(value as TaskRecurrenceEditScope)}
        className="gap-1.5"
      >
        {(['only_this', 'following'] as const).map((value) => (
          <div key={value} className="flex items-center gap-2">
            <RadioGroupItem value={value} id={`${id}-${value}`} />
            <Label htmlFor={`${id}-${value}`} className="font-normal text-sm">
              {t(`scope_${value}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant={scope === 'following' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => onApply(scope)}
        >
          {t('apply')}
        </Button>
      </div>
    </fieldset>
  );
}
