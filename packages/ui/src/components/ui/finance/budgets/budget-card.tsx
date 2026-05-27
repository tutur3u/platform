'use client';

import { Ellipsis } from '@tuturuuu/icons';
import type { FinanceBudget } from '@tuturuuu/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface BudgetCardProps {
  budget: FinanceBudget;
  currency: string;
  deletingId: string | null;
  locale: string;
  onDelete: (id: string) => void;
  onEdit: (budget: FinanceBudget) => void;
}

function formatCurrency(locale: string, currency: string, amount: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(Number(amount));
}

function getProgressColor(percentage: number, threshold: number) {
  if (percentage >= 100) return 'bg-dynamic-red';
  if (percentage >= threshold) return 'bg-dynamic-orange';
  return 'bg-dynamic-green';
}

function isBudgetPeriod(
  value: string
): value is 'custom' | 'monthly' | 'yearly' {
  return value === 'custom' || value === 'monthly' || value === 'yearly';
}

export function BudgetCard({
  budget,
  currency,
  deletingId,
  locale,
  onDelete,
  onEdit,
}: BudgetCardProps) {
  const t = useTranslations('finance-budgets');
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const alertThreshold = budget.alert_threshold ?? 80;
  const percentage =
    budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const remaining = budget.amount - budget.spent;
  const isOverBudget = budget.spent > budget.amount;
  const isNearThreshold = percentage >= alertThreshold;
  const visibleProgressValue = areNumbersHidden ? 0 : Math.min(percentage, 100);
  const periodLabel = isBudgetPeriod(budget.period)
    ? t(budget.period)
    : budget.period;

  return (
    <Card
      className={cn(
        !areNumbersHidden && isOverBudget && 'border-dynamic-red',
        !areNumbersHidden &&
          isNearThreshold &&
          !isOverBudget &&
          'border-dynamic-orange'
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex-1">{budget.name}</span>
          <div className="flex items-center gap-2">
            {!areNumbersHidden && isOverBudget && (
              <span className="rounded-full bg-dynamic-red/10 px-2 py-1 font-medium text-dynamic-red text-xs">
                {t('over_budget')}
              </span>
            )}
            {!areNumbersHidden && isNearThreshold && !isOverBudget && (
              <span className="rounded-full bg-dynamic-orange/10 px-2 py-1 font-medium text-dynamic-orange text-xs">
                {t('alert')}
              </span>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 data-[state=open]:bg-muted"
                >
                  <Ellipsis className="h-4 w-4" />
                  <span className="sr-only">{t('open_menu')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(budget)}>
                  {t('edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      disabled={deletingId === budget.id}
                    >
                      {t('delete')}
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('delete_budget')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('delete_budget_confirmation', {
                          name: budget.name,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(budget.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deletingId === budget.id}
                      >
                        {deletingId === budget.id ? t('deleting') : t('delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardTitle>
        {budget.description && (
          <p className="text-muted-foreground text-sm">{budget.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('spent')}</span>
            <span
              className={cn(
                'font-medium',
                isOverBudget && 'text-dynamic-red',
                isNearThreshold && !isOverBudget && 'text-dynamic-orange'
              )}
            >
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : formatCurrency(locale, currency, budget.spent)}
            </span>
          </div>
          <Progress
            value={visibleProgressValue}
            className="h-2"
            indicatorClassName={
              areNumbersHidden
                ? 'bg-muted-foreground/30'
                : getProgressColor(percentage, alertThreshold)
            }
          />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('budget')}</span>
            <span className="font-medium">
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : formatCurrency(locale, currency, budget.amount)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div>
            <p className="text-muted-foreground text-xs">{t('remaining')}</p>
            <p
              className={cn(
                'font-semibold text-lg',
                areNumbersHidden
                  ? 'text-muted-foreground'
                  : remaining < 0
                    ? 'text-dynamic-red'
                    : 'text-dynamic-green'
              )}
            >
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                    signDisplay: 'always',
                  }).format(Number(remaining))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('used')}</p>
            <p className="font-semibold text-lg">
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : `${percentage.toFixed(1)}%`}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground text-xs">
          {t('period_value', { period: periodLabel })}
        </div>
      </CardContent>
    </Card>
  );
}
