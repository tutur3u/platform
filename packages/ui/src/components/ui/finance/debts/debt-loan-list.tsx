'use client';

import { FileQuestion, Plus } from '@tuturuuu/icons';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import { useTranslations } from 'next-intl';
import { Button } from '../../button';
import { DebtLoanCard } from './debt-loan-card';

interface Props {
  debtLoans: DebtLoanWithBalance[];
  wsId: string;
  currency?: string;
  locale?: string;
  onCreateNew?: () => void;
  emptyMessage?: string;
}

export function DebtLoanList({
  debtLoans,
  wsId,
  currency,
  locale = 'vi-VN',
  onCreateNew,
  emptyMessage,
}: Props) {
  const t = useTranslations('ws-debt-loan');

  if (debtLoans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
        <FileQuestion className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 font-semibold text-lg">
          {emptyMessage || t('no_entries')}
        </h3>
        <p className="mb-4 max-w-md text-center text-muted-foreground text-sm">
          {t('no_entries_description')}
        </p>
        {onCreateNew && (
          <Button onClick={onCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create_first')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {debtLoans.map((debtLoan) => (
        <DebtLoanCard
          key={debtLoan.id}
          debtLoan={debtLoan}
          wsId={wsId}
          currency={currency}
          locale={locale}
        />
      ))}
    </div>
  );
}
