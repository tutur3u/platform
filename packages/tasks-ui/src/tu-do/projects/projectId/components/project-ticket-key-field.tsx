'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { PROJECT_TICKET_KEY_PATTERN } from '@tuturuuu/utils/task-project-ticket-key';
import { useTranslations } from 'next-intl';

export function ProjectTicketKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('task_project_detail.configuration');
  const valid = PROJECT_TICKET_KEY_PATTERN.test(value);
  return (
    <div className="space-y-2">
      <Label
        htmlFor="project-ticket-key"
        className="text-foreground/70 text-sm"
      >
        {t('key_label')}
      </Label>
      <Input
        id="project-ticket-key"
        value={value}
        maxLength={10}
        className="max-w-40 bg-background font-mono"
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-invalid={!valid}
        aria-describedby="project-ticket-key-hint"
      />
      <p
        id="project-ticket-key-hint"
        className={
          valid ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'
        }
      >
        {valid
          ? t('key_preview', { identifier: `${value}-12` })
          : t('key_invalid')}
      </p>
    </div>
  );
}
