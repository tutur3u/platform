'use client';
import { useTranslations } from 'next-intl';

export function StudioTagFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <label className="mb-5 flex flex-wrap items-center gap-3 text-sm">
      <span>{t('studioTagFilter')}</span>
      <select
        className="max-w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{t('studioAllTags')}</option>
        {tags.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>
    </label>
  );
}
