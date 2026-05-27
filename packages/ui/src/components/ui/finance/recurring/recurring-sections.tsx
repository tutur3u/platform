'use client';

import { Calendar, RefreshCw } from '@tuturuuu/icons';
import type {
  RecurringTransactionRecord,
  UpcomingRecurringTransactionRecord,
} from '@tuturuuu/internal-api/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { RecurringTransactionCard } from './recurring-transaction-card';
import { UpcomingTransactionCard } from './upcoming-transaction-card';

interface ActiveRecurringSectionProps {
  currency: string;
  deletingId: string | null;
  isLoading: boolean;
  locale: string;
  onDelete: (id: string) => void;
  onEdit: (transaction: RecurringTransactionRecord) => void;
  t: ReturnType<typeof useTranslations>;
  transactions: RecurringTransactionRecord[];
}

export function ActiveRecurringSection({
  currency,
  deletingId,
  isLoading,
  locale,
  onDelete,
  onEdit,
  t,
  transactions,
}: ActiveRecurringSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          {t('active_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <RecurringCardSkeleton />
        ) : transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((transaction) => (
              <RecurringTransactionCard
                key={transaction.id}
                currency={currency}
                deletingId={deletingId}
                locale={locale}
                onDelete={onDelete}
                onEdit={onEdit}
                t={t}
                transaction={transaction}
              />
            ))}
          </div>
        ) : (
          <RecurringEmptyState
            icon={<RefreshCw className="mb-2 h-8 w-8 text-muted-foreground" />}
            label={t('no_active_transactions')}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface UpcomingRecurringSectionProps {
  currency: string;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  transactions: UpcomingRecurringTransactionRecord[];
}

export function UpcomingRecurringSection({
  currency,
  locale,
  t,
  transactions,
}: UpcomingRecurringSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('upcoming_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((transaction, index) => (
              <UpcomingTransactionCard
                key={`${transaction.id}-${index}`}
                currency={currency}
                index={index}
                locale={locale}
                t={t}
                transaction={transaction}
              />
            ))}
          </div>
        ) : (
          <RecurringEmptyState
            icon={<Calendar className="mb-2 h-8 w-8 text-muted-foreground" />}
            label={t('no_upcoming_transactions')}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RecurringCardSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function RecurringEmptyState({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {icon}
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}
