'use client';

import { AlertCircle, ChevronDown } from '@tuturuuu/icons';
import type { PendingDepositInfo } from '@tuturuuu/types';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useCurrencyFormatter } from '@tuturuuu/ui/hooks/use-currency-formatter';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface WalletInterestPendingDepositsProps {
  deposits: PendingDepositInfo[];
  currency: string;
}

interface AggregatedDeposit {
  depositDate: string;
  totalAmount: number;
  daysUntilInterest: number;
  count: number;
}

/**
 * Component displaying pending deposits that haven't started earning interest yet.
 * Shows aggregated summary with expandable detail list.
 */
export function WalletInterestPendingDeposits({
  deposits,
  currency,
}: WalletInterestPendingDepositsProps) {
  const t = useTranslations('wallet-interest');
  const { formatCurrency, formatDate } = useCurrencyFormatter({ currency });
  const [isOpen, setIsOpen] = useState(false);

  // Aggregate deposits by date
  const { aggregatedDeposits, totalPending } = useMemo(() => {
    const aggregated = deposits.reduce<AggregatedDeposit[]>((acc, deposit) => {
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
    }, []);

    // Sort by date descending
    aggregated.sort(
      (a, b) =>
        new Date(b.depositDate).getTime() - new Date(a.depositDate).getTime()
    );

    const total = deposits.reduce((sum, d) => sum + d.amount, 0);

    return { aggregatedDeposits: aggregated, totalPending: total };
  }, [deposits]);

  if (deposits.length === 0) {
    return null;
  }

  const showExpandable = aggregatedDeposits.length > 3;

  return (
    <Card className="border-dynamic-yellow/30 bg-dynamic-yellow/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-yellow" />
          <div className="flex-1">
            {/* Header with total */}
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('pending_deposits_title')}</h4>
              <span className="font-semibold text-dynamic-yellow text-sm">
                {formatCurrency(totalPending)}
              </span>
            </div>

            {/* Summary text */}
            <p className="mt-1 text-foreground/70 text-sm">
              {t('pending_deposits_summary', {
                count: deposits.length,
                amount: formatCurrency(totalPending),
              })}
            </p>

            {/* Deposit list */}
            {showExpandable ? (
              <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger className="mt-2 flex w-full items-center justify-between rounded-lg bg-background/50 px-3 py-2 text-sm hover:bg-background/80">
                  <span className="text-muted-foreground">
                    {aggregatedDeposits.length} {t('deposit_groups')}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <DepositList
                    deposits={aggregatedDeposits}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    t={t}
                  />
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className="mt-2">
                <DepositList
                  deposits={aggregatedDeposits}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  t={t}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DepositList({
  deposits,
  formatCurrency,
  formatDate,
  t,
}: {
  deposits: AggregatedDeposit[];
  formatCurrency: (amount: number) => string;
  formatDate: (date: string, options?: Intl.DateTimeFormatOptions) => string;
  t: ReturnType<typeof useTranslations<'wallet-interest'>>;
}) {
  return (
    <ul className="space-y-1.5 text-sm">
      {deposits.map((deposit) => (
        <li
          key={deposit.depositDate}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
        >
          <span className="text-muted-foreground">
            {formatDate(deposit.depositDate, {
              month: 'short',
              day: 'numeric',
            })}
            :
          </span>
          <span className="font-medium">
            {formatCurrency(deposit.totalAmount)}
          </span>
          {deposit.count > 1 && (
            <span className="text-muted-foreground">
              ({deposit.count} {t('deposits')})
            </span>
          )}
          <span className="text-muted-foreground">
            {t('starts_in', { days: deposit.daysUntilInterest })}
          </span>
        </li>
      ))}
    </ul>
  );
}
