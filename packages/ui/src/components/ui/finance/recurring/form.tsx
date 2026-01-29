'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const recurringFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  amount: z.string().min(1, 'Amount is required'),
  wallet_id: z.string().min(1, 'Wallet is required'),
  category_id: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
});

type RecurringFormValues = z.infer<typeof recurringFormSchema>;

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

interface RecurringTransactionFormProps {
  wsId: string;
  data?: RecurringTransaction;
  onSuccess?: () => void;
}

export function RecurringTransactionForm({
  wsId,
  data,
  onSuccess,
}: RecurringTransactionFormProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const isEditing = !!data?.id;

  const { data: wallets } = useQuery({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_wallets')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_categories')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: data
      ? {
          name: data.name,
          description: data.description || '',
          amount: String(data.amount),
          wallet_id: data.wallet_id,
          category_id: data.category_id || '',
          frequency: data.frequency,
          start_date: data.start_date,
          end_date: data.end_date || '',
        }
      : {
          name: '',
          description: '',
          amount: '',
          wallet_id: '',
          category_id: '',
          frequency: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
        },
  });

  const onSubmit = async (formData: RecurringFormValues) => {
    try {
      const transactionData = {
        ws_id: wsId,
        name: formData.name,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        wallet_id: formData.wallet_id,
        category_id: formData.category_id || null,
        frequency: formData.frequency,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
      };

      if (isEditing && data) {
        const { error } = await supabase
          .from('recurring_transactions')
          .update(transactionData)
          .eq('id', data.id);

        if (error) throw error;
        toast.success('Recurring transaction updated successfully');
      } else {
        const { error } = await supabase.from('recurring_transactions').insert([
          {
            ...transactionData,
            next_occurrence: formData.start_date,
          },
        ]);

        if (error) throw error;
        toast.success('Recurring transaction created successfully');
      }

      queryClient.invalidateQueries({
        queryKey: ['recurring_transactions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['upcoming_recurring_transactions', wsId],
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error saving recurring transaction:', error);
      toast.error(
        isEditing
          ? 'Failed to update recurring transaction'
          : 'Failed to create recurring transaction'
      );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Monthly rent" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="wallet_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wallet</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {wallets?.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="-500.00"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Negative for expense, positive for income
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date (Optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>Leave empty for indefinite</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit">
            {isEditing
              ? 'Update Recurring Transaction'
              : 'Create Recurring Transaction'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
