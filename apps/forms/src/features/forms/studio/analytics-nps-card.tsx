'use client';

import { cn } from '@tuturuuu/utils/format';
import { getNpsBand, type NpsBand } from '../nps';
import type { FormResponsesQuestionAnalytics } from '../types';

const BAND_BAR: Record<NpsBand, string> = {
  detractor: 'bg-dynamic-red',
  passive: 'bg-dynamic-orange',
  promoter: 'bg-dynamic-green',
};

const BAND_TEXT: Record<NpsBand, string> = {
  detractor: 'text-dynamic-red',
  passive: 'text-dynamic-orange',
  promoter: 'text-dynamic-green',
};

/**
 * NPS results: the score, the three bands, and the 0-10 spread.
 *
 * The score is shown, not an average. Averaging 0-10 answers gives a number
 * that looks like NPS and is not comparable to anyone else's NPS, which is
 * worse than showing nothing — the whole value of the metric is that it means
 * the same thing everywhere.
 *
 * The distribution is included because the score alone hides its own shape: a
 * 0 made of all sevens and a 0 made of half tens and half zeros are the same
 * number about very different sets of customers.
 */
export function AnalyticsNpsCard({
  nps,
  t,
}: {
  nps: NonNullable<FormResponsesQuestionAnalytics['nps']>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const total = nps.promoters + nps.passives + nps.detractors;
  const maxCount = Math.max(...nps.distribution.map((entry) => entry.count), 1);

  const bands = [
    { band: 'promoter' as const, count: nps.promoters },
    { band: 'passive' as const, count: nps.passives },
    { band: 'detractor' as const, count: nps.detractors },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border/50 bg-background/45 p-4">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
            {t('responses.nps_score')}
          </p>
          <p
            className={cn(
              'font-bold text-4xl tabular-nums',
              nps.score > 0
                ? 'text-dynamic-green'
                : nps.score < 0
                  ? 'text-dynamic-red'
                  : ''
            )}
          >
            {nps.score > 0 ? `+${nps.score}` : nps.score}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap gap-4">
          {bands.map(({ band, count }) => (
            <div key={band} className="min-w-20">
              <p
                className={cn(
                  'font-semibold text-lg tabular-nums',
                  BAND_TEXT[band]
                )}
              >
                {count}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t(`responses.nps_${band}`)}
                {total > 0 ? ` · ${Math.round((count / total) * 100)}%` : ''}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
        <p className="mb-3 font-medium text-sm">
          {t('responses.nps_distribution')}
        </p>
        <div className="flex items-end gap-1">
          {nps.distribution.map((entry) => (
            <div
              key={entry.score}
              className="flex flex-1 flex-col items-center gap-1"
              title={t('responses.nps_bar_title', {
                score: entry.score,
                count: entry.count,
              })}
            >
              <div
                className={cn(
                  'w-full rounded-t',
                  BAND_BAR[getNpsBand(entry.score)],
                  entry.count === 0 ? 'opacity-25' : ''
                )}
                // Scaled against the busiest score rather than the total, so a
                // flat spread is still readable instead of eleven slivers.
                style={{
                  height: `${Math.max((entry.count / maxCount) * 72, 3)}px`,
                }}
              />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {entry.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
