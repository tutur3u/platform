'use client';
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

export function ReadingTagFilter({
  entries,
  value,
  onChange,
}: {
  entries: LettinPublicWorld['entries'];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('lettin');
  const id = useId();
  const suggestions = [
    ...new Set(
      entries.flatMap(({ published }) => published.tags).filter(Boolean)
    ),
  ]
    .sort()
    .slice(0, 100);
  return (
    <div className="space-y-2 text-sm">
      <label htmlFor={id}>{t('readingEntryTag')}</label>
      <Input
        id={id}
        value={value}
        maxLength={40}
        list={`${id}-tags`}
        aria-describedby={`${id}-hint`}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
      <datalist id={`${id}-tags`}>
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {t('readingEntryTagHint')}
      </p>
    </div>
  );
}
