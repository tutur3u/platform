'use client';

import { useQuery } from '@tanstack/react-query';
import { listInventoryFinanceEntries } from '@tuturuuu/internal-api';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(getCurrencyLocale(currency), {
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
    style: 'currency',
  }).format(value);
}

export function InventoryProviderSummary({
  canManageFinance,
  currency,
  endDate,
  startDate,
  wsId,
}: {
  canManageFinance: boolean;
  currency: string;
  endDate?: string | null;
  startDate?: string | null;
  wsId: string;
}) {
  const t = useTranslations('inventory-finance-reconciliation');
  const { data, isLoading } = useQuery({
    enabled: canManageFinance,
    queryKey: [
      'inventory-finance-analytics',
      wsId,
      currency,
      startDate,
      endDate,
    ],
    queryFn: () =>
      listInventoryFinanceEntries(wsId, {
        currency,
        endDate: endDate
          ? new Date(`${endDate}T23:59:59.999Z`).toISOString()
          : undefined,
        limit: 1,
        startDate: startDate
          ? new Date(`${startDate}T00:00:00.000Z`).toISOString()
          : undefined,
      }),
  });
  if (!canManageFinance) return null;
  if (isLoading) return <Skeleton className="col-span-full h-48" />;
  const summary = data?.summary;
  const amount = (
    values: Array<{ amount: number; currency: string }> | undefined
  ) => values?.find((item) => item.currency === currency)?.amount ?? 0;
  const rows = [
    { label: t('gross_provider_sales'), value: amount(summary?.grossSales) },
    { label: t('refunds'), value: amount(summary?.refunds) },
    {
      label: t('chargeback_holds'),
      value: amount(summary?.chargebackHolds),
    },
    {
      label: t('chargeback_releases'),
      value: amount(summary?.chargebackReleases),
    },
    { label: t('net_provider_sales'), value: amount(summary?.netSales) },
  ];

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>{t('analytics_title')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('analytics_description')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {rows.map((row) => (
            <div className="rounded-xl border bg-muted/20 p-4" key={row.label}>
              <p className="text-muted-foreground text-xs">{row.label}</p>
              <p className="mt-1 font-semibold text-lg">
                {formatCurrency(row.value, currency)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(summary?.providers ?? []).map((provider) => (
            <div className="rounded-xl border p-4" key={provider.provider}>
              <p className="font-medium">
                {t(`provider_${provider.provider}`)}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {t('net_provider_sales')}{' '}
                <span className="font-medium text-foreground">
                  {formatCurrency(amount(provider.netSales), currency)}
                </span>
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
