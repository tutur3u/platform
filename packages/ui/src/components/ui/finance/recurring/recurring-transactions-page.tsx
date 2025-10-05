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
import { format } from 'date-fns';
import { Calendar, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { RecurringTransactionForm } from './form';

interface RecurringTransactionsPageProps {
  wsId: string;
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
}: RecurringTransactionsPageProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const supabase = createClient();

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
                          <div className="text-right">
                            <p
                              className={`font-semibold ${
                                Number(transaction.amount) >= 0
                                  ? 'text-dynamic-green'
                                  : 'text-dynamic-red'
                              }`}
                            >
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
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
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
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
    </div>
  );
}
