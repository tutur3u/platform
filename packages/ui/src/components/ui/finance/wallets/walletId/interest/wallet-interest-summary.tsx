'use client';

import { AlertCircle, Calendar, Clock, TrendingUp } from '@tuturuuu/icons';
import type { InterestSummary, PendingDepositInfo } from '@tuturuuu/types';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

interface WalletInterestSummaryProps {
  summary: InterestSummary;
  currency: string;
}

/**
 * Summary card showing interest earned today, MTD, YTD, and pending deposits.
 */
export function WalletInterestSummary({
  summary,
  currency,
}: WalletInterestSummaryProps) {
  const t = useTranslations('wallet-interest');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Main Interest Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('today_interest')}
          value={formatCurrency(summary.todayInterest)}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t('mtd_interest')}
          value={formatCurrency(summary.monthToDateInterest)}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t('ytd_interest')}
          value={formatCurrency(summary.yearToDateInterest)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t('total_earned')}
          value={formatCurrency(summary.totalEarnedInterest)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          highlight
        />
      </div>

      {/* Pending Deposits Alert */}
      {summary.pendingDeposits.length > 0 && (
        <PendingDepositsAlert
          deposits={summary.pendingDeposits}
          currency={currency}
        />
      )}

      {/* Estimated Interest */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('estimated_interest')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-muted-foreground text-xs">{t('daily_avg')}</p>
              <p className="font-semibold">
                {formatCurrency(summary.averageDailyInterest)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {t('monthly_est')}
              </p>
              <p className="font-semibold">
                {formatCurrency(summary.estimatedMonthlyInterest)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t('yearly_est')}</p>
              <p className="font-semibold">
                {formatCurrency(summary.estimatedYearlyInterest)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-center text-muted-foreground text-xs">
            {t('estimate_note', {
              rate: summary.currentRate?.annual_rate ?? 0,
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlight = false,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/50 bg-primary/5' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{title}</span>
          {icon}
        </div>
        <p
          className={`mt-1 font-bold text-2xl ${highlight ? 'text-primary' : ''}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PendingDepositsAlert({
  deposits,
  currency,
}: {
  deposits: PendingDepositInfo[];
  currency: string;
}) {
  const t = useTranslations('wallet-interest');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Aggregate deposits by date
  const aggregatedDeposits = deposits.reduce(
    (acc, deposit) => {
      const existing = acc.find((d) => d.depositDate === deposit.depositDate);
      if (existing) {
        existing.totalAmount += deposit.amount;
        existing.count += 1;
      } else {
        acc.push({
          depositDate: deposit.depositDate,
          totalAmount: deposit.amount,
          daysUntilInterest: deposit.daysUntilInterest,
          count: 1,
        });
      }
      return acc;
    },
    [] as {
      depositDate: string;
      totalAmount: number;
      daysUntilInterest: number;
      count: number;
    }[]
  );

  // Sort by date descending
  aggregatedDeposits.sort(
    (a, b) =>
      new Date(b.depositDate).getTime() - new Date(a.depositDate).getTime()
  );

  // Calculate total pending
  const totalPending = deposits.reduce((sum, d) => sum + d.amount, 0);

  return (
    <Card className="border-dynamic-yellow/30 bg-dynamic-yellow/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-yellow" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('pending_deposits_title')}</h4>
              <span className="font-semibold text-dynamic-yellow text-sm">
                {formatCurrency(totalPending)}
              </span>
            </div>
            <p className="mt-1 text-foreground/70 text-sm">
              {t('pending_deposits_description')}
            </p>
            {aggregatedDeposits.length <= 3 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {aggregatedDeposits.map((deposit) => (
                  <li
                    key={deposit.depositDate}
                    className="flex items-center gap-2"
                  >
                    <span className="text-muted-foreground">
                      {deposit.depositDate}:
                    </span>
                    <span className="font-medium">
                      {formatCurrency(deposit.totalAmount)}
                    </span>
                    {deposit.count > 1 && (
                      <span className="text-muted-foreground">
                        ({deposit.count} deposits)
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      · {t('starts_in', { days: deposit.daysUntilInterest })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted-foreground text-sm">
                {deposits.length} deposits across {aggregatedDeposits.length}{' '}
                days
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
