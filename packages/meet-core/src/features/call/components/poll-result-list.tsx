'use client';

import type { PollResults } from '@tuturuuu/realtime/meet/room-polls';
import { useLocale, useTranslations } from 'next-intl';

export function PollResultList({ results }: { results: PollResults }) {
  const t = useTranslations('meet.call.polls');
  const locale = useLocale();
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <p className="text-muted-foreground">
        {t('responses', { count: results.responseCount })}
      </p>
      {results.average !== undefined && (
        <p>
          {t('average', {
            value: new Intl.NumberFormat(locale, {
              maximumFractionDigits: 2,
            }).format(results.average),
          })}
        </p>
      )}
      {results.tally.length > 0 && (
        <ul className="space-y-2">
          {results.tally.map(({ label, count }, index) => (
            <li key={`${index}-${label}`}>
              <div className="flex min-w-0 justify-between gap-2">
                <span className="min-w-0 wrap-break-word">{label}</span>
                <span className="shrink-0 tabular-nums">{count}</span>
              </div>
              <div
                aria-hidden
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-300"
                  style={{
                    width: `${results.responseCount ? (100 * count) / results.responseCount : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {!!results.answers?.length && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {results.answers.map((answer, index) => (
            <li
              key={`${index}-${answer}`}
              className="wrap-break-word whitespace-pre-wrap border-border border-t py-1"
            >
              {answer}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
