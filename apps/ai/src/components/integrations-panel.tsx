'use client';

import { useQuery } from '@tanstack/react-query';
import { Plug, Receipt } from '@tuturuuu/icons';
import {
  getAiStudioProviderCosts,
  getAiStudioProviderInvoices,
} from '@tuturuuu/internal-api/ai-studio';
import { useLocale, useTranslations } from 'next-intl';
import type { DisplayCurrency } from '@/lib/display-currency';
import { useObservabilityFilters } from './observability-filters';
import { ObservabilityToolbar } from './observability-toolbar';
import { ProviderCostPanel } from './provider-cost-panel';
import { SectionCard } from './studio/section-card';

export function IntegrationsPanel({
  workspaceId,
  currency,
}: {
  workspaceId: string;
  currency: DisplayCurrency;
}) {
  const t = useTranslations('ai-studio.integrations-page');
  const locale = useLocale();
  const controls = useObservabilityFilters();
  const { range } = controls;
  const invoices = useQuery({
    queryKey: ['ai-studio-provider-invoices', workspaceId],
    queryFn: () => getAiStudioProviderInvoices(workspaceId),
  });
  const usage = useQuery({
    enabled: Boolean(range),
    queryKey: ['ai-studio-provider-costs', workspaceId, range],
    queryFn: () => getAiStudioProviderCosts(workspaceId, range!),
  });
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.code,
      maximumFractionDigits: currency.code === 'VND' ? 0 : 4,
    }).format(value * currency.rate);
  const rows = invoices.data?.rows ?? [];
  const selected = range
    ? rows.filter(
        (row) =>
          row.issued_on >= range.from.slice(0, 10) &&
          `${row.issued_on}T00:00:00.000Z` < range.to
      )
    : [];
  const providers = new Map<
    string,
    { app: string; provider: string; synced: string }
  >();
  for (const row of [...(usage.data?.rows ?? []), ...rows]) {
    const key = `${row.app_id}:${row.provider}`;
    const synced = 'synced_at' in row ? row.synced_at : row.last_synced_at;
    const previous = providers.get(key);
    if (!previous || previous.synced < synced)
      providers.set(key, { app: row.app_id, provider: row.provider, synced });
  }
  const refresh = () => {
    void invoices.refetch();
    if (range) void usage.refetch();
  };
  return (
    <div className="space-y-4">
      <ObservabilityToolbar
        controls={controls}
        currency={currency}
        isRefreshing={invoices.isFetching || usage.isFetching}
        onRefresh={refresh}
        showRunFilters={false}
      />
      <p className="rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
        {t('coverage')}
      </p>
      <SectionCard
        icon={Plug}
        title={t('providers')}
        description={t('providers-description')}
      >
        {invoices.isError || usage.isError ? (
          <p role="alert">{t('error')}</p>
        ) : invoices.isPending || usage.isPending ? (
          <p role="status">{t('loading')}</p>
        ) : !providers.size ? (
          <p>{t('empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...providers].map(([key, row]) => (
              <div key={key} className="rounded-lg border p-4">
                <p className="font-medium">{row.provider}</p>
                <p className="text-muted-foreground text-sm">{row.app}</p>
                <p className="mt-3 text-muted-foreground text-xs">
                  {t('last-sync')}:{' '}
                  {new Date(row.synced).toLocaleString(locale, {
                    timeZone: 'UTC',
                  })}{' '}
                  UTC
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard
        icon={Receipt}
        title={t('invoices')}
        description={t('invoice-description')}
      >
        {invoices.isError ? (
          <p role="alert">{t('error')}</p>
        ) : invoices.isPending ? (
          <p role="status">{t('loading')}</p>
        ) : (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-muted-foreground text-sm">{t('all-time')}</p>
                <p className="mt-1 font-semibold text-2xl tabular-nums">
                  {rows.length
                    ? money(
                        rows.reduce(
                          (sum, row) => sum + Number(row.amount_usd),
                          0
                        )
                      )
                    : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-muted-foreground text-sm">{t('selected')}</p>
                <p className="mt-1 font-semibold text-2xl tabular-nums">
                  {range && selected.length
                    ? money(
                        selected.reduce(
                          (sum, row) => sum + Number(row.amount_usd),
                          0
                        )
                      )
                    : '—'}
                </p>
              </div>
            </div>
            {!range ? (
              <p>{t('select-range')}</p>
            ) : !selected.length ? (
              <p className="text-muted-foreground text-sm">{t('empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <caption className="sr-only">{t('invoices')}</caption>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {[
                        'provider',
                        'reference',
                        'issued',
                        'reviewed',
                        'amount',
                        'last-sync',
                      ].map((key) => (
                        <th key={key} className="px-2 pb-3">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((row) => (
                      <tr
                        key={`${row.app_id}:${row.provider}:${row.account_id}:${row.reference}`}
                        className="border-b"
                      >
                        <td className="p-2">
                          {row.provider}
                          <span className="block text-muted-foreground text-xs">
                            {row.app_id} · {row.account_id}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {row.reference}
                          <span className="block font-sans text-muted-foreground">
                            {t('paid')}
                          </span>
                        </td>
                        <td className="p-2">{row.issued_on}</td>
                        <td className="p-2">{row.reviewed_on}</td>
                        <td className="p-2 tabular-nums">
                          {money(Number(row.amount_usd))}
                          <span className="block text-muted-foreground text-xs">
                            {Number(row.amount_usd).toFixed(2)} USD
                          </span>
                        </td>
                        <td className="p-2 text-xs">
                          {new Date(row.synced_at).toLocaleString(locale, {
                            timeZone: 'UTC',
                          })}{' '}
                          UTC
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </SectionCard>
      <ProviderCostPanel query={usage} range={range} currency={currency} />
    </div>
  );
}
