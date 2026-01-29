'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Ellipsis, Plus, RefreshCw } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { format } from 'date-fns';
import { useState } from 'react';
import { RecurringTransactionForm } from './form';

interface RecurringTransactionsPageProps {
  wsId: string;
  currency?: string;
}

interface RecurringTransaction {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  next_occurrence: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  wallet_id: string;
  category_id: string | null;
}

export default function RecurringTransactionsPage({
  wsId,
  currency = 'USD',
}: RecurringTransactionsPageProps) {
  const locale = currency === 'VND' ? 'vi-VN' : 'en-US';
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<RecurringTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: recurringTransactions, isLoading } = useQuery({
    queryKey: ['recurring_transactions', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('ws_id', wsId)
        .order('next_occurrence', { ascending: true });

      if (error) throw error;
      return data as RecurringTransaction[];
    },
  });

  const { data: upcomingTransactions } = useQuery({
    queryKey: ['upcoming_recurring_transactions', wsId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_upcoming_recurring_transactions',
        {
          _ws_id: wsId,
          days_ahead: 30,
        }
      );

      if (error) throw error;
      return data;
    },
  });

  const deleteRecurringTransaction = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Recurring transaction deleted successfully');
      queryClient.invalidateQueries({
        queryKey: ['recurring_transactions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['upcoming_recurring_transactions', wsId],
      });
    } catch (error) {
      console.error('Error deleting recurring transaction:', error);
      toast.error('Failed to delete recurring transaction');
    } finally {
      setDeletingId(null);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly',
    };
    return labels[frequency as keyof typeof labels] || frequency;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Recurring Transactions</h1>
          <p className="text-muted-foreground text-sm">
            Manage automatic recurring transactions
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Recurring Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Recurring Transaction</DialogTitle>
            </DialogHeader>
            <RecurringTransactionForm
              wsId={wsId}
              onSuccess={() => setIsCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Recurring Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Active Recurring
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ) : recurringTransactions && recurringTransactions.length > 0 ? (
              <div className="space-y-2">
                {recurringTransactions
                  .filter((t) => t.is_active)
                  .map((transaction) => (
                    <Card key={transaction.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{transaction.name}</h4>
                            {transaction.description && (
                              <p className="text-muted-foreground text-sm">
                                {transaction.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-4 text-xs">
                              <span className="text-muted-foreground">
                                {getFrequencyLabel(transaction.frequency)}
                              </span>
                              <span className="text-muted-foreground">
                                Next:{' '}
                                {format(
                                  new Date(transaction.next_occurrence),
                                  'MMM dd, yyyy'
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <p
                              className={`font-semibold ${
                                Number(transaction.amount) >= 0
                                  ? 'text-dynamic-green'
                                  : 'text-dynamic-red'
                              }`}
                            >
                              {new Intl.NumberFormat(locale, {
                                style: 'currency',
                                currency,
                                signDisplay: 'always',
                              }).format(Number(transaction.amount))}
                            </p>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="h-8 w-8 p-0 data-[state=open]:bg-muted"
                                >
                                  <Ellipsis className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() =>
                                    setEditingTransaction(transaction)
                                  }
                                >
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      disabled={deletingId === transaction.id}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Delete Recurring Transaction
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete &quot;
                                        {transaction.name}&quot;? This action
                                        cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          deleteRecurringTransaction(
                                            transaction.id
                                          )
                                        }
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        disabled={deletingId === transaction.id}
                                      >
                                        {deletingId === transaction.id
                                          ? 'Deleting...'
                                          : 'Delete'}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <RefreshCw className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  No active recurring transactions
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming (Next 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingTransactions && upcomingTransactions.length > 0 ? (
              <div className="space-y-2">
                {upcomingTransactions.map((transaction: any, index: number) => (
                  <Card key={`${transaction.id}-${index}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{transaction.name}</h4>
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {transaction.wallet_name}
                            </span>
                            {transaction.category_name && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <span className="text-muted-foreground">
                                  {transaction.category_name}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {format(
                              new Date(transaction.next_occurrence),
                              'MMM dd, yyyy'
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              Number(transaction.amount) >= 0
                                ? 'text-dynamic-green'
                                : 'text-dynamic-red'
                            }`}
                          >
                            {new Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency,
                              signDisplay: 'always',
                            }).format(Number(transaction.amount))}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  No upcoming transactions
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Recurring Transaction</DialogTitle>
          </DialogHeader>
          {editingTransaction && (
            <RecurringTransactionForm
              wsId={wsId}
              data={editingTransaction}
              onSuccess={() => setEditingTransaction(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
