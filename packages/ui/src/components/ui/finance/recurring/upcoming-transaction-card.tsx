'use client';

import type { UpcomingRecurringTransactionRecord } from '@tuturuuu/internal-api/finance';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { format } from 'date-fns';
import type { useTranslations } from 'next-intl';

interface UpcomingTransactionCardProps {
  currency: string;
  index: number;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  transaction: UpcomingRecurringTransactionRecord;
}

export function UpcomingTransactionCard({
  currency,
  index,
  locale,
  t,
  transaction,
}: UpcomingTransactionCardProps) {
  const amount = Number(transaction.amount);

  return (
    <Card key={`${transaction.id}-${index}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-medium">{transaction.name}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {transaction.wallet_name && (
                <span className="text-muted-foreground">
                  {transaction.wallet_name}
                </span>
              )}
              {transaction.wallet_name && transaction.category_name && (
                <span className="text-muted-foreground">/</span>
              )}
              {transaction.category_name && (
                <span className="text-muted-foreground">
                  {transaction.category_name}
                </span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('scheduled_for', {
                date: format(
                  new Date(transaction.next_occurrence),
                  'MMM dd, yyyy'
                ),
              })}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`font-semibold ${
                amount >= 0 ? 'text-dynamic-green' : 'text-dynamic-red'
              }`}
            >
              {new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                signDisplay: 'always',
              }).format(amount)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
