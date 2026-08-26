'use client';

import { cn } from '@tuturuuu/utils/format';
import type { FormResponsesQuestionAnalytics } from '../types';

/**
 * Ranking results, best-first by mean position.
 *
 * Mean position rather than first-choice count, because a poll can have a
 * winner nobody put first: an option ranked second by everyone beats one that
 * half the respondents love and half put last. First-choice count is shown
 * beside it, since that is the number people reach for and the two disagreeing
 * is itself the interesting result.
 *
 * An option nobody ranked has no mean, so it renders as "not ranked" rather
 * than a zero that would sort it to the top as everyone's favourite.
 */
export function AnalyticsRankingCard({
  ranking,
  t,
}: {
  ranking: NonNullable<FormResponsesQuestionAnalytics['ranking']>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const ranked = ranking.filter((entry) => entry.count > 0);
  // The scale runs 1..n, so a bar is filled by how far from last it sits.
  const worstRank = Math.max(...ranked.map((entry) => entry.averageRank), 1);

  return (
    <div className="space-y-2 rounded-2xl border border-border/50 bg-background/45 p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="font-medium text-sm">{t('responses.ranking_results')}</p>
        <p className="text-[11px] text-muted-foreground">
          {t('responses.ranking_hint')}
        </p>
      </div>

      {ranking.map((entry, index) => {
        const isRanked = entry.count > 0;
        const fill = isRanked
          ? Math.max(((worstRank - entry.averageRank) / worstRank) * 100, 6)
          : 0;

        return (
          <div key={entry.value} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-right font-semibold text-muted-foreground text-xs tabular-nums">
              {isRanked ? index + 1 : '—'}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium text-sm">
                  {entry.label}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {isRanked
                    ? t('responses.ranking_average', {
                        average: entry.averageRank,
                        first: entry.firstChoiceCount,
                      })
                    : t('responses.ranking_unranked')}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className={cn(
                    'h-full rounded-full',
                    isRanked ? 'bg-dynamic-blue' : 'bg-transparent'
                  )}
                  style={{ width: `${fill}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
