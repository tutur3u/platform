'use client';

import { useLocale, useTranslations } from 'next-intl';

export function LiveActionPreview({ args }: { args: Record<string, unknown> }) {
  const t = useTranslations('dashboard.voice_assistant.studio');
  const locale = useLocale();
  const fields = {
    name: 'title',
    title: 'title',
    taskId: 'task',
    description: 'description',
    priority: 'priority',
    completed: 'completed',
    start_at: 'starts',
    end_at: 'ends',
    location: 'location',
  } as const;
  return (
    <dl className="max-h-48 space-y-2 overflow-auto rounded-lg bg-muted/50 p-3 text-sm">
      {Object.entries(args).map(([key, value]) => {
        const field = fields[key as keyof typeof fields];
        if (!field) return null;
        let display =
          typeof value === 'string'
            ? value
            : typeof value === 'boolean'
              ? t(value ? 'yes' : 'no')
              : String(value ?? '');
        if (
          (key === 'start_at' || key === 'end_at') &&
          typeof value === 'string' &&
          Number.isFinite(Date.parse(value))
        )
          display = new Date(value).toLocaleString(locale);
        return (
          <div key={key}>
            <dt className="text-muted-foreground text-xs">
              {t(`fields.${field}`)}
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words">
              {display}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
