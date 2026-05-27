'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRecurringTransaction,
  listTransactionCategories,
  listWallets,
  type RecurringTransactionRecord,
  updateRecurringTransaction,
} from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { RecurringFormFields } from './form-fields';
import {
  createRecurringFormSchema,
  NO_CATEGORY_VALUE,
  type RecurringFormValues,
} from './form-schema';

interface RecurringTransactionFormProps {
  data?: RecurringTransactionRecord;
  onSuccess?: () => void;
  wsId: string;
}

export function RecurringTransactionForm({
  wsId,
  data,
  onSuccess,
}: RecurringTransactionFormProps) {
  const t = useTranslations('finance-recurring');
  const queryClient = useQueryClient();
  const isEditing = !!data?.id;
  const formSchema = createRecurringFormSchema(t);

  const { data: wallets } = useQuery({
    queryKey: ['wallets', wsId],
    queryFn: () => listWallets(wsId),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', wsId],
    queryFn: () => listTransactionCategories(wsId),
  });

  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: data
      ? {
          name: data.name,
          description: data.description || '',
          amount: String(data.amount),
          wallet_id: data.wallet_id,
          category_id: data.category_id || NO_CATEGORY_VALUE,
          frequency: data.frequency,
          start_date: data.start_date,
          end_date: data.end_date || '',
        }
      : {
          name: '',
          description: '',
          amount: '',
          wallet_id: '',
          category_id: NO_CATEGORY_VALUE,
          frequency: 'monthly',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
        },
  });

  const onSubmit = async (formData: RecurringFormValues) => {
    try {
      const transactionData = {
        name: formData.name,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        wallet_id: formData.wallet_id,
        category_id:
          formData.category_id === NO_CATEGORY_VALUE
            ? null
            : formData.category_id || null,
        frequency: formData.frequency,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
      };

      if (isEditing && data) {
        await updateRecurringTransaction(wsId, data.id, transactionData);
        toast.success(t('update_success'));
      } else {
        await createRecurringTransaction(wsId, transactionData);
        toast.success(t('create_success'));
      }

      queryClient.invalidateQueries({
        queryKey: ['recurring_transactions', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['upcoming_recurring_transactions', wsId],
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('save_error'));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <RecurringFormFields
          categories={categories}
          form={form}
          t={t}
          wallets={wallets}
        />

        <div className="flex justify-end">
          <Button type="submit">
            {isEditing ? t('update_transaction') : t('create_transaction')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
