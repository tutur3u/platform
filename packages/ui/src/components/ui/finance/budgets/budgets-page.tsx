'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { deleteBudget, listBudgets } from '@tuturuuu/internal-api';
import type { FinanceBudget } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BudgetCard } from './budget-card';
import { BudgetForm } from './form';

interface BudgetsPageProps {
  wsId: string;
  currency?: string;
  searchParams: {
    create?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

export default function BudgetsPage({
  wsId,
  currency = 'USD',
  searchParams,
}: BudgetsPageProps) {
  const t = useTranslations('finance-budgets');
  const locale = getCurrencyLocale(currency);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(
    searchParams.create === 'budget'
  );
  const [editingBudget, setEditingBudget] = useState<FinanceBudget | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (searchParams.create === 'budget') setIsCreateDialogOpen(true);
  }, [searchParams.create]);

  const { data: budgets, isLoading } = useQuery({
    queryKey: ['budgets', wsId],
    queryFn: () => listBudgets(wsId),
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      await deleteBudget(wsId, id);
    },
    onSuccess: () => {
      toast.success(t('deleted_successfully'));
      void queryClient.invalidateQueries({ queryKey: ['budgets', wsId] });
      void queryClient.invalidateQueries({ queryKey: ['budget_status', wsId] });
    },
    onError: () => {
      toast.error(t('failed_to_delete'));
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">{t('plural')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('title_description')}
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('create')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('create_new')}</DialogTitle>
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
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              currency={currency}
              deletingId={deletingId}
              locale={locale}
              onDelete={(id) => deleteBudgetMutation.mutate(id)}
              onEdit={setEditingBudget}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              {t('empty_description')}
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('create')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={!!editingBudget}
        onOpenChange={(open) => !open && setEditingBudget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('edit_budget')}</DialogTitle>
          </DialogHeader>
          {editingBudget && (
            <BudgetForm
              wsId={wsId}
              budgetId={editingBudget.id}
              initialData={{
                name: editingBudget.name,
                description: editingBudget.description || '',
                amount: String(editingBudget.amount),
                period: editingBudget.period as 'monthly' | 'yearly' | 'custom',
                start_date: editingBudget.start_date,
                end_date: editingBudget.end_date || '',
                alert_threshold: String(editingBudget.alert_threshold),
                category_id: editingBudget.category_id || '',
                wallet_id: editingBudget.wallet_id || '',
              }}
              onSuccess={() => setEditingBudget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
