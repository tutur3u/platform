import { useTranslations } from 'next-intl';

export function TaskPlanSource({
  sourceUrl,
  checked,
  onChange,
}: {
  sourceUrl: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslations('task-plan');
  return (
    <div className="space-y-2 rounded-md border border-border p-4">
      <label className="flex gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{t('attachSource')}</span>
      </label>
      <p className="text-muted-foreground text-sm">{t('sourceConsent')}</p>
      <a
        className="text-sm underline"
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('reviewSource')}
      </a>
    </div>
  );
}
