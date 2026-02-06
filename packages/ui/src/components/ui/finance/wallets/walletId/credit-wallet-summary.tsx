'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  TrendingDown,
} from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

interface CreditSummaryData {
  limit: number;
  balance: number;
  availableCredit: number;
  totalOutstanding: number;
  utilization: number;
  statementBalance: number;
  currentActivity: number;
  nextStatementDate: string;
  daysUntilStatement: number;
  nextPaymentDate: string;
  daysUntilPayment: number;
  cycleStart: string;
  cycleEnd: string;
  prevCycleStart: string;
  prevCycleEnd: string;
}

interface CreditWalletSummaryProps {
  wsId: string;
  wallet: Wallet;
}

function getUtilizationColor(utilization: number): string {
  if (utilization >= 80) return 'bg-dynamic-red';
  if (utilization >= 50) return 'bg-dynamic-yellow';
  return 'bg-dynamic-green';
}

function getUtilizationTextColor(utilization: number): string {
  if (utilization >= 80) return 'text-dynamic-red';
  if (utilization >= 50) return 'text-dynamic-yellow';
  return 'text-dynamic-green';
}

export function CreditWalletSummary({
  wsId,
  wallet,
}: CreditWalletSummaryProps) {
  const t = useTranslations('wallet-data-table');
  const [showDetails, setShowDetails] = useState(false);
  const currency = wallet.currency ?? 'VND';
  const { formatCurrency } = useCurrencyFormatter({ currency });

  const { data, isLoading, error } = useQuery<CreditSummaryData>({
    queryKey: ['credit-summary', wallet.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${wsId}/wallets/${wallet.id}/credit-summary`
      );
      if (!res.ok) throw new Error('Failed to fetch credit summary');
      return res.json();
    },
    staleTime: 30000,
    enabled: wallet.type === 'CREDIT',
  });

  const handleToggle = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  if (wallet.type !== 'CREDIT') return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          {t('credit_summary')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Utilization Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('credit_utilization')}
            </span>
            <span
              className={cn(
                'font-semibold',
                getUtilizationTextColor(data.utilization)
              )}
            >
              {data.utilization}%
            </span>
          </div>
          <Progress
            value={data.utilization}
            className="h-3"
            indicatorClassName={cn(
              getUtilizationColor(data.utilization),
              'transition-all duration-500'
            )}
          />
          <p className="text-muted-foreground text-xs">
            {formatCurrency(data.totalOutstanding)}{' '}
            {t('of_limit', { limit: formatCurrency(data.limit) })}
          </p>
        </div>

        {/* Hero Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              {t('available_credit')}
            </p>
            <p className="font-semibold text-lg">
              {formatCurrency(data.availableCredit)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              {t('total_outstanding')}
            </p>
            <p className="font-semibold text-lg">
              {data.totalOutstanding > 0
                ? formatCurrency(data.totalOutstanding)
                : formatCurrency(0)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">
              {t('current_activity')}
            </p>
            <p className="font-semibold text-lg">
              {data.currentActivity !== 0
                ? formatCurrency(data.currentActivity)
                : t('no_charges')}
            </p>
          </div>
        </div>

        {/* Expand/Collapse Toggle */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-4 w-4" />
              {t('collapse_details')}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              {t('expand_details')}
            </>
          )}
        </button>

        {/* Expandable Details */}
        {showDetails && (
          <>
            <Separator />
            <div className="space-y-3">
              {/* Statement Balance */}
              <DetailRow
                icon={<TrendingDown className="h-4 w-4" />}
                label={t('statement_balance')}
                sublabel={`${t('previous_cycle')}: ${data.prevCycleStart} — ${data.prevCycleEnd}`}
                value={
                  data.statementBalance !== 0
                    ? formatCurrency(data.statementBalance)
                    : t('no_charges')
                }
              />

              <Separator />

              {/* Next Statement Date */}
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label={t('next_statement')}
                sublabel={data.nextStatementDate}
                value={
                  <Badge variant="secondary">
                    {t('days_remaining', {
                      days: data.daysUntilStatement,
                    })}
                  </Badge>
                }
              />

              {/* Payment Due Date */}
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label={t('payment_due_date')}
                sublabel={data.nextPaymentDate}
                value={
                  data.daysUntilPayment < 0 ? (
                    <Badge variant="destructive">{t('overdue')}</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {t('days_remaining', {
                        days: data.daysUntilPayment,
                      })}
                    </Badge>
                  )
                }
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon,
  label,
  sublabel,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-muted-foreground text-xs">{sublabel}</p>
        </div>
      </div>
      <div className="text-right font-medium text-sm">{value}</div>
    </div>
  );
}
