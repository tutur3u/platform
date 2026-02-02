'use client';

import {
  Calculator,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Badge } from '@tuturuuu/ui/badge';
import { cn, getCurrencyLocale } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface TransactionStatisticsProps {
  transactions: Transaction[];
  stats?: {
    totalTransactions: number;
    totalIncome: number;
    totalExpense: number;
    netTotal: number;
    hasRedactedAmounts: boolean;
  };
  isLoading?: boolean;
  currency?: string;
}

export function TransactionStatistics({
  transactions,
  stats,
  isLoading,
  currency = 'USD',
}: TransactionStatisticsProps) {
  const t = useTranslations();

  const localStatistics = useMemo(() => {
    if (stats) return stats;

    const amounts = transactions
      .filter(
        (transaction) =>
          !(
            transaction.amount === undefined &&
            transaction.is_amount_confidential
          )
      )
      .map((transaction) => transaction.amount ?? 0);

    const totalTransactions = transactions.length;
    const totalIncome = amounts.filter((a) => a > 0).reduce((a, b) => a + b, 0);
    const totalExpense = amounts
      .filter((a) => a < 0)
      .reduce((a, b) => a + b, 0);
    const netTotal = totalIncome + totalExpense;

    const hasRedactedAmounts = transactions.some(
      (transaction) =>
        transaction.amount === undefined && transaction.is_amount_confidential
    );

    return {
      totalTransactions,
      totalIncome,
      totalExpense,
      netTotal,
      hasRedactedAmounts,
    };
  }, [transactions, stats]);

  const statistics = stats || localStatistics;
  const isNetPositive = statistics.netTotal >= 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="flex h-50 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="border-border/40 border-b bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm ring-1 ring-primary/20">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-lg">
              {t('workspace-finance-transactions.statistics-summary')}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t('workspace-finance-transactions.filtered-results')}
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Transactions */}
        <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-muted-foreground text-xs">
              {t('workspace-finance-transactions.total-transactions')}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-2xl text-foreground tabular-nums">
              {statistics.totalTransactions}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {statistics.totalTransactions === 1
                ? t('date_groups.transaction')
                : t('date_groups.transactions')}
            </Badge>
          </div>
        </div>

        {/* Total Income */}
        <div className="flex flex-col gap-2 rounded-xl bg-dynamic-green/5 p-4 transition-all hover:bg-dynamic-green/10">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-dynamic-green" />
            <span className="font-medium text-dynamic-green/80 text-xs">
              {t('workspace-finance-transactions.total-income')}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-2xl text-dynamic-green tabular-nums">
              {statistics.hasRedactedAmounts && '≈ '}
              {Intl.NumberFormat(getCurrencyLocale(currency), {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(statistics.totalIncome)}
            </span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="flex flex-col gap-2 rounded-xl bg-dynamic-red/5 p-4 transition-all hover:bg-dynamic-red/10">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-dynamic-red" />
            <span className="font-medium text-dynamic-red/80 text-xs">
              {t('workspace-finance-transactions.total-expenses')}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-2xl text-dynamic-red tabular-nums">
              {statistics.hasRedactedAmounts && '≈ '}
              {Intl.NumberFormat(getCurrencyLocale(currency), {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(Math.abs(statistics.totalExpense))}
            </span>
          </div>
        </div>

        {/* Net Total */}
        <div
          className={cn(
            'flex flex-col gap-2 rounded-xl p-4 transition-all',
            isNetPositive
              ? 'bg-dynamic-green/10 hover:bg-dynamic-green/15'
              : 'bg-dynamic-red/10 hover:bg-dynamic-red/15'
          )}
        >
          <div className="flex items-center gap-2">
            {isNetPositive ? (
              <TrendingUp className="h-4 w-4 text-dynamic-green" />
            ) : (
              <TrendingDown className="h-4 w-4 text-dynamic-red" />
            )}
            <span
              className={cn(
                'font-medium text-xs',
                isNetPositive ? 'text-dynamic-green/80' : 'text-dynamic-red/80'
              )}
            >
              {t('workspace-finance-transactions.net-total')}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'font-bold text-2xl tabular-nums',
                isNetPositive ? 'text-dynamic-green' : 'text-dynamic-red'
              )}
            >
              {statistics.hasRedactedAmounts && '≈ '}
              {Intl.NumberFormat(getCurrencyLocale(currency), {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
                signDisplay: 'always',
              }).format(statistics.netTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
