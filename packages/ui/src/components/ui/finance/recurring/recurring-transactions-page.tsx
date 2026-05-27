'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import {
  deleteRecurringTransaction as deleteRecurringTransactionRequest,
  listRecurringTransactions,
  listUpcomingRecurringTransactions,
  type RecurringTransactionRecord,
} from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { getCurrencyLocale } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { RecurringTransactionForm } from './form';
import {
  ActiveRecurringSection,
  UpcomingRecurringSection,
} from './recurring-sections';

interface RecurringTransactionsPageProps {
  currency?: string;
  openCreateDialog?: boolean;
  wsId: string;
}

export default function RecurringTransactionsPage({
  currency = 'USD',
  openCreateDialog = false,
  wsId,
}: RecurringTransactionsPageProps) {
  const t = useTranslations('finance-recurring');
  const locale = getCurrencyLocale(currency);
  const [isCreateDialogOpen, setIsCreateDialogOpen] =
    useState(openCreateDialog);
  const [editingTransaction, setEditingTransaction] =
    useState<RecurringTransactionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (openCreateDialog) setIsCreateDialogOpen(true);
  }, [openCreateDialog]);

  const { data: recurringTransactions = [], isLoading } = useQuery({
    queryKey: ['recurring_transactions', wsId],
    queryFn: () => listRecurringTransactions(wsId),
  });

  const { data: upcomingTransactions = [] } = useQuery({
    queryKey: ['upcoming_recurring_transactions', wsId],
    queryFn: () => listUpcomingRecurringTransactions(wsId, { daysAhead: 30 }),
  });

  const activeTransactions = useMemo(
    () => recurringTransactions.filter((transaction) => transaction.is_active),
    [recurringTransactions]
  );

  const handleDeleteRecurringTransaction = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRecurringTransactionRequest(wsId, id);

      toast.success(t('delete_success'));
      queryClient.invalidateQueries({
        queryKey: ['recurring_transactions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['upcoming_recurring_transactions', wsId],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('page_description')}
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('create_transaction')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('create_transaction')}</DialogTitle>
            </DialogHeader>
            <RecurringTransactionForm
              wsId={wsId}
              onSuccess={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ActiveRecurringSection
          currency={currency}
          deletingId={deletingId}
          isLoading={isLoading}
          locale={locale}
          onDelete={handleDeleteRecurringTransaction}
          onEdit={setEditingTransaction}
          t={t}
          transactions={activeTransactions}
        />
        <UpcomingRecurringSection
          currency={currency}
          locale={locale}
          t={t}
          transactions={upcomingTransactions}
        />
      </div>

      <Dialog
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('edit_transaction')}</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <RecurringTransactionForm
              data={editingTransaction}
              wsId={wsId}
              onSuccess={() => setEditingTransaction(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
