'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  TrendingDown,
  TrendingUp,
} from '@tuturuuu/icons';
import type { DebtLoanSummary } from '@tuturuuu/types/primitives/DebtLoan';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useFinanceHref } from '../finance-route-context';
import StatisticCard from '../statistics/card';

interface Props {
  summary: DebtLoanSummary;
  currency?: string;
  locale?: string;
  wsId?: string;
}

export function DebtLoanSummaryCards({
  summary,
  currency = 'VND',
  locale = 'vi-VN',
  wsId,
}: Props) {
  const t = useTranslations('ws-debt-loan');
  const financeHref = useFinanceHref();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatisticCard
        title={t('total_debt_remaining')}
        value={summary.total_debt_remaining}
        currency={currency}
        locale={locale}
        icon={<TrendingDown className="h-5 w-5 text-red-500" />}
        href={wsId ? `/${wsId}${financeHref('/debts')}?type=debt` : undefined}
      />

      <StatisticCard
        title={t('total_loan_remaining')}
        value={summary.total_loan_remaining}
        currency={currency}
        locale={locale}
        icon={<TrendingUp className="h-5 w-5 text-green-500" />}
        href={wsId ? `/${wsId}${financeHref('/debts')}?type=loan` : undefined}
      />

      <StatisticCard
        title={t('net_position')}
        value={summary.net_position}
        currency={currency}
        locale={locale}
        icon={
          <Scale
            className={cn(
              'h-5 w-5',
              summary.net_position >= 0 ? 'text-green-500' : 'text-red-500'
            )}
          />
        }
        className={cn(
          summary.net_position >= 0
            ? 'border-green-200 dark:border-green-800'
            : 'border-red-200 dark:border-red-800'
        )}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4">
          <div className="rounded-lg bg-red-500/10 p-2">
            <ArrowDownCircle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="font-medium text-2xl">{summary.active_debt_count}</p>
            <p className="text-muted-foreground text-sm">{t('active_debts')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4">
          <div className="rounded-lg bg-green-500/10 p-2">
            <ArrowUpCircle className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-medium text-2xl">{summary.active_loan_count}</p>
            <p className="text-muted-foreground text-sm">{t('active_loans')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
