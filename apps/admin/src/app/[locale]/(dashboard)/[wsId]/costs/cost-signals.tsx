'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import { useFormatter, useTranslations } from 'next-intl';
import type { CostAnomaly } from '@/lib/admin-costs/trends';
import { CostSection, SectionMessage } from './cost-section';
import type { ReadyCosts, Section } from './cost-view';

export function CostSignals({
  anomalies,
}: {
  anomalies: Section<CostAnomaly[]>;
}) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();
  if (anomalies.kind === 'ok' && anomalies.data.length === 0) return null;
  const usd = (value: number) =>
    format.number(value, { currency: 'USD', style: 'currency' });

  return (
    <CostSection title={t('anomalies.title')}>
      {anomalies.kind === 'unavailable' ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : (
        <ul className="divide-y">
          {anomalies.data.map((anomaly) => (
            <li
              key={`${anomaly.kind}:${anomaly.provider}`}
              className="flex items-start gap-3 px-4 py-3 text-sm md:px-5"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange"
                aria-hidden
              />
              <span>
                {anomaly.kind === 'daily-spike'
                  ? t('anomalies.daily_spike', {
                      baseline: usd(anomaly.baselineUsd),
                      billed: usd(anomaly.billedUsd),
                      day: anomaly.day,
                      provider: anomaly.provider,
                    })
                  : t('anomalies.month_growth', {
                      forecast: usd(anomaly.forecastUsd),
                      previous: usd(anomaly.previousMonthUsd),
                      provider: anomaly.provider,
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CostSection>
  );
}

export function CostCoverage({
  coverage,
}: {
  coverage: ReadyCosts['coverage'];
}) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();

  return (
    <CostSection title={t('coverage.title')}>
      {coverage.kind === 'unavailable' ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : (
        <ul className="divide-y text-sm">
          {coverage.data.collected.map((entry) => (
            <li
              key={entry.provider}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 md:px-5"
            >
              <span className="font-medium">{entry.provider}</span>
              <span className="text-muted-foreground">
                {entry.lastCollectedAt
                  ? t('coverage.collected', {
                      days: entry.days,
                      when: format.dateTime(new Date(entry.lastCollectedAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })
                  : t('coverage.pending')}
                {entry.exhaustedDays > 0
                  ? ` · ${t('coverage.exhausted', { days: entry.exhaustedDays })}`
                  : null}
              </span>
            </li>
          ))}
          {coverage.data.missing.length > 0 ? (
            <li className="px-4 py-3 text-muted-foreground md:px-5">
              {t('coverage.missing', {
                providers: coverage.data.missing.join(', '),
              })}
            </li>
          ) : null}
        </ul>
      )}
    </CostSection>
  );
}
