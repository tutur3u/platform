'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { BudgetForm } from './form';

interface BudgetsPageProps {
  wsId: string;
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

interface Budget {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  spent: number;
  period: string;
  start_date: string;
  end_date: string | null;
  alert_threshold: number;
  is_active: boolean;
  category_id: string | null;
  wallet_id: string | null;
}

export default function BudgetsPage({ wsId }: BudgetsPageProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const supabase = createClient();

  const { data: budgets, isLoading } = useQuery({
    queryKey: ['budgets', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_budgets')
        .select('*')
        .eq('ws_id', wsId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Budget[];
    },
  });

  const getProgressColor = (percentage: number, threshold: number) => {
    if (percentage >= 100) return 'bg-dynamic-red';
    if (percentage >= threshold) return 'bg-dynamic-orange';
    return 'bg-dynamic-green';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Budgets</h1>
          <p className="text-muted-foreground text-sm">
            Track and manage your workspace budgets
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Budget</DialogTitle>
            </DialogHeader>
            <BudgetForm
              wsId={wsId}
              onSuccess={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-8 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : budgets && budgets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const percentage =
              budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
            const remaining = budget.amount - budget.spent;
            const isOverBudget = budget.spent > budget.amount;
            const isNearThreshold = percentage >= budget.alert_threshold;

            return (
              <Card
                key={budget.id}
                className={cn(
                  isOverBudget && 'border-dynamic-red',
                  isNearThreshold && !isOverBudget && 'border-dynamic-orange'
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{budget.name}</span>
                    {isOverBudget && (
                      <span className="rounded-full bg-dynamic-red/10 px-2 py-1 font-medium text-dynamic-red text-xs">
                        Over Budget
                      </span>
                    )}
                    {isNearThreshold && !isOverBudget && (
                      <span className="rounded-full bg-dynamic-orange/10 px-2 py-1 font-medium text-dynamic-orange text-xs">
                        Alert
                      </span>
                    )}
                  </CardTitle>
                  {budget.description && (
                    <p className="text-muted-foreground text-sm">
                      {budget.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Spent</span>
                      <span
                        className={cn(
                          'font-medium',
                          isOverBudget && 'text-dynamic-red',
                          isNearThreshold &&
                            !isOverBudget &&
                            'text-dynamic-orange'
                        )}
                      >
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(Number(budget.spent))}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(percentage, 100)}
                      className="h-2"
                      indicatorClassName={getProgressColor(
                        percentage,
                        budget.alert_threshold
                      )}
                    />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="font-medium">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(Number(budget.amount))}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div>
                      <p className="text-muted-foreground text-xs">Remaining</p>
                      <p
                        className={cn(
                          'font-semibold text-lg',
                          remaining < 0
                            ? 'text-dynamic-red'
                            : 'text-dynamic-green'
                        )}
                      >
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          signDisplay: 'always',
                        }).format(Number(remaining))}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Used</p>
                      <p className="font-semibold text-lg">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="text-muted-foreground text-xs">
                    Period: {budget.period}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              No budgets yet. Create your first budget to start tracking
              spending.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Budget
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
