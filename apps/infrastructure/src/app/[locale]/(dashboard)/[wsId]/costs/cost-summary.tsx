'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { SectionMessage } from './cost-section';
import type { CostOverview, Section } from './cost-view';

export function CostSummary({ overview }: { overview: Section<CostOverview> }) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();
  if (overview.kind === 'unavailable')
    return (
      <div className="rounded-lg border bg-card">
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      </div>
    );
  const usd = (value: number) =>
    format.number(value, { currency: 'USD', style: 'currency' });
  const { data } = overview;
  const perUser = data.spendPerActiveUserUsd;
  // A total without any verified collection is not a measured zero.
  const spend = (value: number, measured: boolean, partial: boolean) =>
    !measured
      ? t('summary.not_measured')
      : partial
        ? `${usd(value)} ${t('summary.partial')}`
        : usd(value);
  const tiles = [
    {
      label: t('summary.to_date'),
      value: spend(data.toDateUsd, data.measured.toDate, data.partial.toDate),
    },
    {
      label: t('summary.forecast'),
      value: spend(
        data.forecastUsd,
        data.measured.forecast,
        data.partial.forecast
      ),
    },
    {
      label: t('summary.previous_month'),
      value: spend(
        data.previousMonthUsd,
        data.measured.previous,
        data.partial.previous
      ),
    },
    {
      label: t('summary.per_active_user'),
      value:
        perUser.kind === 'ok' && perUser.data !== null
          ? `${format.number(perUser.data, {
              currency: 'USD',
              maximumFractionDigits: 4,
              style: 'currency',
            })}${data.partial.perUser ? ` ${t('summary.partial')}` : ''}`
          : t('summary.not_measured'),
    },
  ];
  return (
    <section className="space-y-2" aria-label={t('summary.label')}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-card px-4 py-4">
            <dt className="text-muted-foreground text-sm">{tile.label}</dt>
            <dd className="mt-1 font-semibold text-xl tabular-nums">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm">
        {t('summary.basis', { month: data.month })}
        {data.verificationUnavailable
          ? ` ${t('summary.verification_unavailable')}`
          : null}
        {(data.measured.toDate && data.partial.toDate) ||
        (data.measured.forecast && data.partial.forecast) ||
        (data.measured.previous && data.partial.previous)
          ? ` ${t('summary.incomplete')}`
          : null}
      </p>
    </section>
  );
}
