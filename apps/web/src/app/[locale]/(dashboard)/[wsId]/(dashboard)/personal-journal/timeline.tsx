'use client';
import {
  type JournalEntry,
  type JournalPeriod,
  journalPeriodKey,
} from '@tuturuuu/internal-api/personal-journal';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
export default function JournalTimeline({
  items,
  timezone,
  period,
  disabled,
  onEdit,
}: {
  items: JournalEntry[];
  timezone: string;
  period: JournalPeriod;
  disabled: boolean;
  onEdit: (entry: JournalEntry) => void;
}) {
  const t = useTranslations('personal_journal');
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of [...items].sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id)
  )) {
    const key = journalPeriodKey(entry.occurredAt, timezone, period);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return (
    <div className="space-y-6">
      {[...groups].map(([key, entries]) => (
        <section key={key} aria-label={key}>
          <h2 className="mb-3 font-semibold">{key}</h2>
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-2 rounded-lg border p-4">
                <h3 className="font-medium">{entry.title || t('untitled')}</h3>
                <p className="text-muted-foreground text-sm">
                  <time dateTime={entry.occurredAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(entry.occurredAt))}
                  </time>{' '}
                  · {t(entry.domain)} · {t(entry.category)}
                </p>
                <p className="whitespace-pre-wrap break-words">{entry.body}</p>
                {entry.mood && (
                  <p>
                    {t('mood')}: {t(`mood_${entry.mood}`)}
                  </p>
                )}
                {entry.moodContext && (
                  <p className="whitespace-pre-wrap break-words">
                    {entry.moodContext}
                  </p>
                )}
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onEdit(entry)}
                >
                  {t('edit')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
