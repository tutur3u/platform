'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { getAiStudioProviderCosts } from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { DisplayCurrency } from '@/lib/display-currency';
import { SectionCard } from './studio/section-card';

export function ProviderCostPanel({
  query,
  range,
  currency = { code: 'USD', rate: 1 },
}: {
  currency?: DisplayCurrency;
  query: UseQueryResult<Awaited<ReturnType<typeof getAiStudioProviderCosts>>>;
  range: { from: string; to: string } | null;
}) {
  const t = useTranslations('ai-studio.provider-costs');
  const money = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: currency.code === 'VND' ? 0 : 2,
      maximumFractionDigits: currency.code === 'VND' ? 0 : 6,
    }).format(Number(value) * currency.rate);
  return (
    <div id="provider-costs" className="scroll-mt-6">
      <SectionCard
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={!range || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('refresh')}
          </Button>
        }
      >
        <p className="mb-4 text-muted-foreground text-xs">{t('coverage')}</p>
        {!range ? (
          <p role="status">{t('select_range')}</p>
        ) : query.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {t('error')}
          </p>
        ) : query.isPending ? (
          <p role="status">{t('loading')}</p>
        ) : !query.data.rows.length ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="border-b text-muted-foreground text-xs">
                <tr>
                  <th className="pb-3">{t('month')}</th>
                  <th>{t('app')}</th>
                  <th>{t('service')}</th>
                  <th className="text-right">{t('runs')}</th>
                  <th className="text-right">
                    {t('amount', { currency: currency.code })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((row) => (
                  <tr
                    key={`${row.month}:${row.app_id}:${row.provider}:${row.service}`}
                    className="border-b"
                  >
                    <td className="py-3">{row.month}</td>
                    <td>{row.app_id}</td>
                    <td>
                      <span className="block">{row.provider}</span>
                      <span className="text-muted-foreground text-xs">
                        {row.service}
                      </span>
                    </td>
                    <td className="text-right">{row.runs}</td>
                    <td className="text-right tabular-nums">
                      {money(row.amount_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="pt-3">
                    {t('total')}
                  </th>
                  <td className="pt-3 text-right font-semibold tabular-nums">
                    {money(
                      query.data.rows.reduce(
                        (sum, row) => sum + Number(row.amount_usd),
                        0
                      )
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
