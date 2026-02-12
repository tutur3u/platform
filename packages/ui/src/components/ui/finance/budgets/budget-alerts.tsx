'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useFinanceHref } from '../finance-route-context';

interface BudgetAlertsProps {
  wsId: string;
  className?: string;
}

export function BudgetAlerts({ wsId, className }: BudgetAlertsProps) {
  const supabase = createClient();
  const financeHref = useFinanceHref();

  const { data: budgetStatus } = useQuery({
    queryKey: ['budget_status', wsId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_budget_status', {
        _ws_id: wsId,
      });

      if (error) throw error;
      return data as Array<{
        budget_id: string;
        budget_name: string;
        amount: number;
        spent: number;
        remaining: number;
        percentage_used: number;
        is_over_budget: boolean;
        is_near_threshold: boolean;
      }>;
    },
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
          <AlertTitle>Budget Exceeded: {budget.budget_name}</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-2">
            <p>
              You've spent{' '}
              <span className="font-semibold">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(Number(budget.spent))}
              </span>{' '}
              of your{' '}
              <span className="font-semibold">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(Number(budget.amount))}
              </span>{' '}
              budget ({budget.percentage_used.toFixed(1)}% used).
            </p>
            <Link href={`/${wsId}${financeHref('/budgets')}`}>
              <Button size="sm" variant="outline" className="w-fit">
                View Budget Details
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ))}

      {nearThresholdAlerts.map((budget) => (
        <Alert key={budget.budget_id} className="border-dynamic-orange">
          <TrendingUp className="h-4 w-4 text-dynamic-orange" />
          <AlertTitle>Budget Alert: {budget.budget_name}</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-2">
            <p>
              You've used{' '}
              <span className="font-semibold text-dynamic-orange">
                {budget.percentage_used.toFixed(1)}%
              </span>{' '}
              of your budget. Consider reviewing your spending.
            </p>
            <Link href={`/${wsId}${financeHref('/budgets')}`}>
              <Button
                size="sm"
                variant="outline"
                className="w-fit border-dynamic-orange text-dynamic-orange hover:bg-dynamic-orange/10"
              >
                View Budget Details
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
