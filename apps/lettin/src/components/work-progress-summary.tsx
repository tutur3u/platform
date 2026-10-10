'use client';
import type {
  LettinRecord,
  LettinWorkProgress,
} from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { workProgressOptions } from '../work-progress';

/** Saved notebook entries only; browsing filters and local editor buffers are excluded. */
export function WorkProgressSummary({ entries }: { entries: LettinRecord[] }) {
  const t = useTranslations('lettin');
  const counts: Record<LettinWorkProgress, number> = {
    unstarted: 0,
    drafting: 0,
    revising: 0,
    ready: 0,
  };
  for (const entry of entries) {
    counts[entry.draft.workProgress ?? 'unstarted'] += 1;
  }
  return (
    <section
      aria-label={t('workProgressSummary')}
      className="mb-5 space-y-2 rounded border border-border p-3 text-sm"
    >
      <h2 className="font-medium">{t('workProgressSummary')}</h2>
      <p>{t('wikiEntryCount', { count: entries.length })}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {workProgressOptions.map((stage) => (
          <div key={stage}>
            <dt className="text-muted-foreground">
              {t(`workProgress_${stage}`)}
            </dt>
            <dd className="font-medium">
              {t('workProgressSummaryCount', {
                count: counts[stage],
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">
        {t('workProgressSummaryHint')}
      </p>
    </section>
  );
}
