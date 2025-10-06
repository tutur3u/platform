'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
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

const budgetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  amount: z.string().min(1, 'Amount is required'),
  period: z.enum(['monthly', 'yearly', 'custom']),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  alert_threshold: z.string().optional(),
  category_id: z.string().optional(),
  wallet_id: z.string().optional(),
});

type BudgetFormValues = z.infer<typeof budgetFormSchema>;

interface BudgetFormProps {
  wsId: string;
  budgetId?: string;
  initialData?: Partial<BudgetFormValues>;
  onSuccess?: () => void;
}

export function BudgetForm({
  wsId,
  budgetId,
  initialData,
  onSuccess,
}: BudgetFormProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: initialData || {
      name: '',
      description: '',
      amount: '',
      period: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      alert_threshold: '80',
      category_id: '',
      wallet_id: '',
    },
  });

  const onSubmit = async (data: BudgetFormValues) => {
    try {
      const budgetData = {
        ws_id: wsId,
        name: data.name,
        description: data.description || null,
        amount: parseFloat(data.amount),
        period: data.period,
        start_date: data.start_date,
        end_date: data.end_date || null,
        alert_threshold: data.alert_threshold
          ? parseFloat(data.alert_threshold)
          : 80,
        category_id: data.category_id || null,
        wallet_id: data.wallet_id || null,
      };

      if (budgetId) {
        const { error } = await supabase
          .from('finance_budgets')
          .update(budgetData)
          .eq('id', budgetId);

        if (error) throw error;
        toast.success('Budget updated successfully');
      } else {
        const { error } = await supabase
          .from('finance_budgets')
          .insert([budgetData]);

        if (error) throw error;
        toast.success('Budget created successfully');
      }

      queryClient.invalidateQueries({ queryKey: ['budgets', wsId] });
      queryClient.invalidateQueries({ queryKey: ['budget_status', wsId] });

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Failed to save budget');
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
                <Input placeholder="Monthly food budget" {...field} />
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
                <Textarea
                  placeholder="Optional description for this budget"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Budget Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="1000.00"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="alert_threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Alert Threshold (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="80"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Get alerted when spending reaches this percentage
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a period" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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
                <FormDescription>
                  Leave empty for recurring budgets
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit">
            {budgetId ? 'Update Budget' : 'Create Budget'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
