'use client';

import { Calendar, Clock, Percent, User, Wallet } from '@tuturuuu/icons';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '../../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import { Progress } from '../../progress';

interface Props {
  debtLoan: DebtLoanWithBalance;
  wsId: string;
  currency?: string;
}

export function DebtLoanCard({ debtLoan, wsId, currency }: Props) {
  const t = useTranslations('ws-debt-loan');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400';
      case 'paid':
        return 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400';
      case 'defaulted':
        return 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400';
      case 'cancelled':
        return 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'debt'
      ? 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400'
      : 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400';
  };

  const isOverdue =
    debtLoan.status === 'active' &&
    debtLoan.due_date &&
    new Date(debtLoan.due_date) < new Date();

  return (
    <Link href={`/${wsId}/finance/debts/${debtLoan.id}`}>
      <Card
        className={cn(
          'cursor-pointer transition-all hover:border-foreground/20 hover:shadow-md',
          isOverdue && 'border-red-300 dark:border-red-800'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="line-clamp-1 text-lg">
                {debtLoan.name}
              </CardTitle>
              {debtLoan.counterparty && (
                <div className="mt-1 flex items-center gap-1 text-muted-foreground text-sm">
                  <User className="h-3.5 w-3.5" />
                  <span className="line-clamp-1">{debtLoan.counterparty}</span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="outline" className={getTypeColor(debtLoan.type)}>
                {t(debtLoan.type)}
              </Badge>
              <Badge
                variant="outline"
                className={getStatusColor(debtLoan.status)}
              >
                {t(debtLoan.status)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('principal_amount')}
              </span>
              <span className="font-medium">
                {formatCurrency(
                  debtLoan.principal_amount,
                  currency || debtLoan.currency
                )}
              </span>
            </div>
            {debtLoan.total_paid > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t('amount_paid')}
                </span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(
                    debtLoan.total_paid,
                    currency || debtLoan.currency
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('remaining')}</span>
              <span
                className={cn(
                  'font-semibold',
                  debtLoan.remaining_balance === 0
                    ? 'text-green-600 dark:text-green-400'
                    : debtLoan.type === 'debt'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-blue-600 dark:text-blue-400'
                )}
              >
                {formatCurrency(
                  debtLoan.remaining_balance,
                  currency || debtLoan.currency
                )}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {debtLoan.status === 'active' && (
            <div className="space-y-1">
              <Progress value={debtLoan.progress_percentage} className="h-2" />
              <p className="text-right text-muted-foreground text-xs">
                {debtLoan.progress_percentage.toFixed(1)}% {t('completed')}
              </p>
            </div>
          )}

          {/* Additional info */}
          <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
            {debtLoan.interest_rate !== null &&
              debtLoan.interest_rate !== undefined && (
                <div className="flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" />
                  <span>
                    {debtLoan.interest_rate}%/{t('year')}
                  </span>
                </div>
              )}
            {debtLoan.due_date && (
              <div
                className={cn(
                  'flex items-center gap-1',
                  isOverdue && 'text-red-600 dark:text-red-400'
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {isOverdue && `${t('overdue')}: `}
                  {new Date(debtLoan.due_date).toLocaleDateString()}
                </span>
              </div>
            )}
            {debtLoan.wallet_id && (
              <div className="flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" />
                <span>{t('linked_wallet')}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{new Date(debtLoan.start_date).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
