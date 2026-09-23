'use client';

import type { SubscriptionPaymentCurrency } from '@tuturuuu/internal-api/finance-subscription-analytics';
import { useLocale, useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../tooltip';
import { FINANCE_HIDDEN_AMOUNT } from '../../shared/use-finance-confidential-visibility';

export function SubscriptionPaymentDetails({
  data,
  hidden,
}: {
  data: SubscriptionPaymentCurrency;
  hidden: boolean;
}) {
  const t = useTranslations('invoice-subscriptions');
  const locale = useLocale();
  const format = (value: number) =>
    hidden
      ? FINANCE_HIDDEN_AMOUNT
      : new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: data.currency,
        }).format(value);
  const max = Math.max(1, ...data.distribution.map((bin) => bin.userCount));
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <h3 className="font-medium text-sm">{t('distribution')}</h3>
        <p className="mt-1 text-muted-foreground text-xs">
          {t('distribution_help')}
        </p>
        <TooltipProvider>
          <div className="mt-4 flex flex-wrap gap-3">
            {data.distribution.map((bin) => (
              <Tooltip key={bin.groupCount}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="min-w-36 flex-1 rounded-lg border bg-background p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('distribution_value', bin)}
                  >
                    <div className="flex justify-between gap-4 text-sm">
                      <span>
                        {t('groups_count', { count: bin.groupCount })}
                      </span>
                      <strong className="tabular-nums">{bin.userCount}</strong>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(bin.userCount / max) * 100}%` }}
                      />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('distribution_value', bin)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium text-sm focus-visible:outline-ring">
          {t('table')}
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                {[
                  'period',
                  'paidUsers',
                  'paidGroups',
                  'memberships',
                  'amount',
                ].map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-3 py-2 text-start font-medium"
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.periods.map((row) => (
                <tr key={row.period} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    {row.period}
                  </th>
                  <td className="px-3 py-2">{row.paidUsers}</td>
                  <td className="px-3 py-2">{row.paidGroups}</td>
                  <td className="px-3 py-2">{row.memberships}</td>
                  <td className="px-3 py-2">{format(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
