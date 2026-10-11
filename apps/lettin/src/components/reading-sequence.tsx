'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function ReadingSequence({
  entries,
  selected,
  onSelect,
}: {
  entries: { id: string; title: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('lettin');
  const index = entries.findIndex(({ id }) => id === selected);
  if (index < 0 || entries.length < 2) return null;
  const previous = entries[index - 1];
  const next = entries[index + 1];
  return (
    <nav
      aria-label={t('readingSequence')}
      className="mt-8 flex flex-wrap gap-3"
    >
      <Button
        variant="outline"
        disabled={!previous}
        onClick={() => previous && onSelect(previous.id)}
      >
        {t('previousReadingEntry')}
        {previous && <> · {previous.title}</>}
      </Button>
      <Button
        variant="outline"
        disabled={!next}
        onClick={() => next && onSelect(next.id)}
      >
        {t('nextReadingEntry')}
        {next && <> · {next.title}</>}
      </Button>
    </nav>
  );
}
