'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Gauge,
  TrendingDown,
} from '@tuturuuu/icons';
import {
  getWalletCreditSummary,
  type WalletCreditSummary,
} from '@tuturuuu/internal-api/finance';
import type { Wallet } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../../shared/use-finance-confidential-visibility';

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
  const walletId = wallet.id ?? '';
  const { formatCurrency } = useCurrencyFormatter({ currency });
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const formatVisibleCurrency = (amount: number) =>
    areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : formatCurrency(amount);

  const { data, isLoading, error } = useQuery<WalletCreditSummary>({
    queryKey: ['credit-summary', wsId, walletId],
    queryFn: () => getWalletCreditSummary(wsId, walletId),
    staleTime: 30000,
    enabled: wallet.type === 'CREDIT' && Boolean(walletId),
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
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            {t('credit_operations')}
          </CardTitle>
          <CardDescription>{t('credit_summary_unavailable')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const utilization = Math.max(0, data.utilization);
  const progressValue = Math.min(utilization, 100);
  const outstandingDebt = Math.max(data.totalOutstanding, 0);
  const hasCreditBalance = data.balance > 0 && outstandingDebt === 0;
  const isOverLimit = data.availableCredit < 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          {t('credit_operations')}
        </CardTitle>
        <CardDescription>{t('credit_operations_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1.6fr]">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm">
                  {t('total_outstanding')}
                </p>
                <p className="font-semibold text-2xl">
                  {formatVisibleCurrency(outstandingDebt)}
                </p>
              </div>
              {isOverLimit ? (
                <Badge variant="destructive">{t('credit_over_limit')}</Badge>
              ) : hasCreditBalance ? (
                <Badge variant="secondary">{t('credit_balance_credit')}</Badge>
              ) : (
                <Badge variant="secondary">{t('current_cycle')}</Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('credit_utilization')}
                </span>
                <span
                  className={cn(
                    'font-semibold',
                    getUtilizationTextColor(utilization)
                  )}
                >
                  {utilization}%
                </span>
              </div>
              <Progress
                value={progressValue}
                className="h-3"
                indicatorClassName={cn(
                  getUtilizationColor(utilization),
                  'transition-all duration-500'
                )}
              />
              <p className="text-muted-foreground text-xs">
                {formatVisibleCurrency(outstandingDebt)}{' '}
                {t('of_limit', { limit: formatVisibleCurrency(data.limit) })}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryTile
              icon={<Gauge className="h-4 w-4" />}
              label={
                isOverLimit ? t('credit_over_limit') : t('credit_available')
              }
              value={formatVisibleCurrency(Math.abs(data.availableCredit))}
            />
            <SummaryTile
              icon={<TrendingDown className="h-4 w-4" />}
              label={t('current_activity')}
              value={
                data.currentActivity !== 0
                  ? formatVisibleCurrency(data.currentActivity)
                  : t('no_charges')
              }
            />
            <SummaryTile
              icon={<Calendar className="h-4 w-4" />}
              label={t('next_statement')}
              value={data.nextStatementDate}
              subvalue={t('days_remaining', {
                days: data.daysUntilStatement,
              })}
            />
            <SummaryTile
              icon={<Clock className="h-4 w-4" />}
              label={t('payment_due_date')}
              value={data.nextPaymentDate}
              subvalue={
                data.daysUntilPayment < 0
                  ? t('overdue')
                  : t('days_remaining', {
                      days: data.daysUntilPayment,
                    })
              }
            />
          </div>
        </div>

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

        {showDetails && (
          <>
            <Separator />
            <div className="space-y-3">
              <DetailRow
                icon={<TrendingDown className="h-4 w-4" />}
                label={t('statement_balance')}
                sublabel={`${t('previous_cycle')}: ${data.prevCycleStart} - ${data.prevCycleEnd}`}
                value={
                  data.statementBalance !== 0
                    ? formatVisibleCurrency(data.statementBalance)
                    : t('no_charges')
                }
              />

              <Separator />

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

function SummaryTile({
  icon,
  label,
  subvalue,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  subvalue?: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="font-semibold text-base">{value}</p>
      {subvalue ? (
        <p className="mt-1 text-muted-foreground text-xs">{subvalue}</p>
      ) : null}
    </div>
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
