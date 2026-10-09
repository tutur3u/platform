'use client';
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { workProgressOptions } from '../work-progress';

/** Saved notebook entries only; browsing filters and local editor buffers are excluded. */
export function WorkProgressSummary({ entries }: { entries: LettinRecord[] }) {
  const t = useTranslations('lettin');
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
                count: entries.filter(
                  (entry) => (entry.draft.workProgress ?? 'unstarted') === stage
                ).length,
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
