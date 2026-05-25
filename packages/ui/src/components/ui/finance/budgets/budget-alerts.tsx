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
  const currencyFormatter = new Intl.NumberFormat(getCurrencyLocale(currency), {
    style: 'currency',
    currency,
  });

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
                amount: currencyFormatter.format(Number(budget.amount)),
                percentage: budget.percentage_used.toFixed(1),
                spent: currencyFormatter.format(Number(budget.spent)),
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
                percentage: budget.percentage_used.toFixed(1),
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
