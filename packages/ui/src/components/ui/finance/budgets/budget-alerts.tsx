'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp } from '@tuturuuu/icons';
import { getBudgetStatus } from '@tuturuuu/internal-api';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFinanceHref } from '../finance-route-context';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface BudgetAlertsProps {
  wsId: string;
  currency?: string;
  className?: string;
}

export function BudgetAlerts({
  wsId,
  currency = 'USD',
  className,
}: BudgetAlertsProps) {
  const t = useTranslations('finance-budgets');
  const financeHref = useFinanceHref();
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const currencyFormatter = new Intl.NumberFormat(getCurrencyLocale(currency), {
    style: 'currency',
    currency,
  });
  const formatVisibleCurrency = (amount: string | number) =>
    areNumbersHidden
      ? FINANCE_HIDDEN_AMOUNT
      : currencyFormatter.format(Number(amount));
  const formatVisiblePercentage = (percentage: number) =>
    areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : percentage.toFixed(1);

  const { data: budgetStatus } = useQuery({
    queryKey: ['budget_status', wsId],
    queryFn: () => getBudgetStatus(wsId),
  });

  if (!budgetStatus || budgetStatus.length === 0) return null;

  const overBudgetAlerts = budgetStatus.filter((b) => b.is_over_budget);
  const nearThresholdAlerts = budgetStatus.filter(
    (b) => b.is_near_threshold && !b.is_over_budget
  );

  if (overBudgetAlerts.length === 0 && nearThresholdAlerts.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {overBudgetAlerts.map((budget) => (
        <Alert key={budget.budget_id} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {t('alert_exceeded_title', { name: budget.budget_name })}
          </AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-2">
            <p>
              {t('alert_exceeded_description', {
                amount: formatVisibleCurrency(budget.amount),
                percentage: formatVisiblePercentage(budget.percentage_used),
                spent: formatVisibleCurrency(budget.spent),
              })}
            </p>
            <Link href={`/${wsId}${financeHref('/budgets')}`}>
              <Button size="sm" variant="outline" className="w-fit">
                {t('view_details')}
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ))}

      {nearThresholdAlerts.map((budget) => (
        <Alert key={budget.budget_id} className="border-dynamic-orange">
          <TrendingUp className="h-4 w-4 text-dynamic-orange" />
          <AlertTitle>
            {t('alert_near_threshold_title', { name: budget.budget_name })}
          </AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-2">
            <p>
              {t('alert_near_threshold_description', {
                percentage: formatVisiblePercentage(budget.percentage_used),
              })}
            </p>
            <Link href={`/${wsId}${financeHref('/budgets')}`}>
              <Button
                size="sm"
                variant="outline"
                className="w-fit border-dynamic-orange text-dynamic-orange hover:bg-dynamic-orange/10"
              >
                {t('view_details')}
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
