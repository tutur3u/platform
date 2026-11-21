'use client';

import type { PollResults as Results } from '@tuturuuu/realtime/meet/room-polls';
import { useLocale, useTranslations } from 'next-intl';

export function PollResults({ results }: { results: Results }) {
  const t = useTranslations('meet.call.polls');
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <p className="text-muted-foreground">
        {t('responses', { count: results.responseCount })}
      </p>
      {results.average !== undefined && (
        <p className="font-medium">
          {t('average', {
            value: new Intl.NumberFormat(locale, {
              maximumFractionDigits: 2,
            }).format(results.average),
          })}
        </p>
      )}
      {results.tally.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {results.tally.map(({ label, count }, index) => (
            <li key={`${index}-${label}`} className="flex flex-col gap-1">
              <div className="flex min-w-0 justify-between gap-3">
                <span className="min-w-0 wrap-break-word">{label}</span>
                <span className="shrink-0 tabular-nums">{count}</span>
              </div>
              <div
                aria-hidden
                className="h-1.5 overflow-hidden rounded-full bg-muted"
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
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {results.answers.map((answer, index) => (
            <li
              key={`${index}-${answer}`}
              className="wrap-break-word whitespace-pre-wrap border-t py-1.5"
            >
              {answer}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
