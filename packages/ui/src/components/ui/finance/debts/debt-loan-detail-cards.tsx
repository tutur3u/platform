'use client';

import { Calendar, Clock, Percent, Wallet } from '@tuturuuu/icons';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import { Progress } from '../../progress';
import { Separator } from '../../separator';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface DebtLoanDetailCardsProps {
  debtLoan: DebtLoanWithBalance;
}

export function DebtLoanPaymentOverviewCard({
  debtLoan,
}: DebtLoanDetailCardsProps) {
  const t = useTranslations('ws-debt-loan');
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('payment_overview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('principal_amount')}
            </span>
            <span className="font-semibold text-lg">
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : formatCurrency(debtLoan.principal_amount, debtLoan.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('amount_paid')}</span>
            <span className="font-semibold text-dynamic-green text-lg">
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : formatCurrency(debtLoan.total_paid, debtLoan.currency)}
            </span>
          </div>
          {debtLoan.total_interest_paid > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('interest_paid')}
              </span>
              <span className="text-muted-foreground">
                {areNumbersHidden
                  ? FINANCE_HIDDEN_AMOUNT
                  : formatCurrency(
                      debtLoan.total_interest_paid,
                      debtLoan.currency
                    )}
              </span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('remaining')}</span>
            <span
              className={cn(
                'font-bold text-xl',
                areNumbersHidden
                  ? 'text-muted-foreground'
                  : debtLoan.remaining_balance === 0
                    ? 'text-dynamic-green'
                    : debtLoan.type === 'debt'
                      ? 'text-dynamic-red'
                      : 'text-dynamic-blue'
              )}
            >
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : formatCurrency(debtLoan.remaining_balance, debtLoan.currency)}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={debtLoan.progress_percentage} className="h-3" />
          <p className="text-center text-muted-foreground text-sm">
            {debtLoan.progress_percentage.toFixed(1)}% {t('completed')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface DebtLoanDetailsCardProps extends DebtLoanDetailCardsProps {
  isOverdue: boolean | null | undefined;
  wallets: WalletType[];
}

export function DebtLoanDetailsCard({
  debtLoan,
  isOverdue,
  wallets,
}: DebtLoanDetailsCardProps) {
  const t = useTranslations('ws-debt-loan');
  const locale = useLocale();
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale).format(new Date(value));
  const linkedWalletName =
    wallets.find((wallet) => wallet.id === debtLoan.wallet_id)?.name ||
    t('unknown_wallet');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('details')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t('start_date')}:</span>
            <span className="font-medium">
              {formatDate(debtLoan.start_date)}
            </span>
          </div>

          {debtLoan.due_date && (
            <div
              className={cn(
                'flex items-center gap-2',
                isOverdue && 'text-dynamic-red'
              )}
            >
              <Clock className="h-4 w-4" />
              <span className={cn(!isOverdue && 'text-muted-foreground')}>
                {t('due_date')}:
              </span>
              <span className="font-medium">
                {formatDate(debtLoan.due_date)}
                {isOverdue && ` (${t('overdue')})`}
              </span>
            </div>
          )}

          {debtLoan.interest_rate !== null &&
            debtLoan.interest_rate !== undefined && (
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t('interest_rate')}:
                </span>
                <span className="font-medium">
                  {debtLoan.interest_rate}%/{t('year')}
                  {debtLoan.interest_type && ` (${t(debtLoan.interest_type)})`}
                </span>
              </div>
            )}

          {debtLoan.wallet_id && (
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {t('associated_wallet')}:
              </span>
              <span className="font-medium">{linkedWalletName}</span>
            </div>
          )}
        </div>

        {debtLoan.description && (
          <>
            <Separator />
            <div>
              <p className="mb-1 font-medium text-sm">{t('description')}</p>
              <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                {debtLoan.description}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
