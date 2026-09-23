'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw } from '@tuturuuu/icons';
import { getSubscriptionPaymentAnalytics } from '@tuturuuu/internal-api/finance-subscription-analytics';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useId, useState } from 'react';
import { Button } from '../../button';
import { Card, CardContent, CardHeader } from '../../card';
import { Skeleton } from '../../skeleton';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';
import {
  type PaymentMetric,
  SubscriptionPaymentChart,
} from './charts/subscription-payment-chart';
import { SubscriptionPaymentDetails } from './charts/subscription-payment-details';

export function SubscriptionPaymentAnalytics({
  wsId,
  currency = 'USD',
}: {
  wsId: string;
  currency?: string;
}) {
  const t = useTranslations('invoice-subscriptions');
  const locale = useLocale();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [granularity, setGranularity] = useState<'monthly' | 'yearly'>(
    'monthly'
  );
  const [metric, setMetric] = useState<PaymentMetric>('paidUsers');
  const [selectedCurrency, setCurrency] = useState(currency);
  const { isConfidential, toggleConfidential } =
    useFinanceConfidentialVisibility();
  const [userIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [walletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const id = useId();
  const query = useQuery({
    queryKey: [
      'invoice-subscription-analytics',
      wsId,
      year,
      granularity,
      userIds,
      walletIds,
    ],
    queryFn: () =>
      getSubscriptionPaymentAnalytics(wsId, {
        year,
        granularity,
        userIds,
        walletIds,
      }),
    staleTime: 30_000,
    retry: false,
  });
  const data =
    query.data?.currencies.find(
      (value) => value.currency === selectedCurrency
    ) ?? query.data?.currencies[0];
  const format = (value: number, key: string) =>
    key === 'amount'
      ? isConfidential
        ? FINANCE_HIDDEN_AMOUNT
        : new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: data?.currency ?? currency,
          }).format(value)
      : new Intl.NumberFormat(locale).format(value);
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-semibold text-lg tracking-tight">
              {t('title')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(isConfidential ? 'show' : 'hide')}
              onClick={toggleConfidential}
            >
              {isConfidential ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('refresh')}
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <fieldset
            className="inline-flex rounded-lg border p-1"
            aria-label={t('granularity')}
          >
            {(['monthly', 'yearly'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={granularity === value ? 'secondary' : 'ghost'}
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
              >
                {t(value)}
              </Button>
            ))}
          </fieldset>
          <label className="grid gap-1 text-xs" htmlFor={`${id}-year`}>
            {t(granularity === 'monthly' ? 'year' : 'ending_year')}
            <select
              id={`${id}-year`}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {Array.from(
                { length: new Date().getFullYear() - 2000 + 3 },
                (_, index) => new Date().getFullYear() + 2 - index
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {(query.data?.currencies.length ?? 0) > 1 && (
            <label className="grid gap-1 text-xs" htmlFor={`${id}-currency`}>
              {t('currency')}
              <select
                id={`${id}-currency`}
                className="h-9 rounded-lg border bg-background px-3 text-sm"
                value={data?.currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {query.data?.currencies.map((value) => (
                  <option key={value.currency}>{value.currency}</option>
                ))}
              </select>
            </label>
          )}
          <p className="text-muted-foreground text-xs">{t('filters')}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5" aria-busy={query.isFetching}>
        {query.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 p-6 text-sm"
          >
            <p>{t('error')}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            {(query.data?.unallocatedInvoices ?? 0) > 0 && (
              <p
                role="status"
                className="rounded-lg border bg-muted/40 p-3 text-sm"
              >
                {t('unallocated', { count: query.data!.unallocatedInvoices })}
              </p>
            )}
            {!data ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <p className="font-medium">{t('empty')}</p>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t('empty_help')}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                  {(
                    [
                      'paidUsers',
                      'paidGroups',
                      'memberships',
                      'amount',
                    ] as const
                  ).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={metric === key}
                      onClick={() => setMetric(key)}
                      className={`flex flex-col justify-between rounded-xl border p-3 text-start sm:p-4 ${key === 'amount' ? 'col-span-3 lg:col-span-1' : ''} transition-colors focus-visible:outline-2 focus-visible:outline-ring ${metric === key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                    >
                      <span className="text-muted-foreground text-xs">
                        {t(key)}
                      </span>
                      <span className="mt-2 block break-words font-semibold text-xl tabular-nums tracking-tight">
                        {format(data.summary[key], key)}
                      </span>
                    </button>
                  ))}
                </div>
                <SubscriptionPaymentChart
                  periods={data.periods}
                  metric={metric}
                  currency={data.currency}
                  hidden={isConfidential}
                />
                <SubscriptionPaymentDetails
                  data={data}
                  hidden={isConfidential}
                />
              </>
            )}
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t('method')}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
