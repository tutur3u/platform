'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBudget,
  type FinanceBudgetUpsertPayload,
  listTransactionCategories,
  listWallets,
  updateBudget,
} from '@tuturuuu/internal-api';
import { Form } from '@tuturuuu/ui/form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  BudgetAmountFields,
  BudgetBasicsFields,
  BudgetDateFields,
  BudgetPeriodField,
  BudgetScopeFields,
  BudgetSubmitButton,
} from './form-fields';
import {
  type BudgetFormValues,
  createBudgetFormSchema,
  NO_CATEGORY_VALUE,
  NO_WALLET_VALUE,
} from './form-schema';

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
  const t = useTranslations('finance-budgets');
  const queryClient = useQueryClient();
  const budgetFormSchema = useMemo(() => createBudgetFormSchema(t), [t]);

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['transaction-categories', wsId],
    queryFn: () => listTransactionCategories(wsId),
  });

  const { data: wallets = [], isLoading: isLoadingWallets } = useQuery({
    queryKey: ['wallets', wsId],
    queryFn: () => listWallets(wsId),
  });

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
      category_id: NO_CATEGORY_VALUE,
      wallet_id: NO_WALLET_VALUE,
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: FinanceBudgetUpsertPayload) => {
      if (budgetId) {
        await updateBudget(wsId, budgetId, payload);
        return 'updated';
      }
      await createBudget(wsId, payload);
      return 'created';
    },
    onSuccess: (result) => {
      toast.success(
        result === 'updated'
          ? t('updated_successfully')
          : t('created_successfully')
      );
      void queryClient.invalidateQueries({ queryKey: ['budgets', wsId] });
      void queryClient.invalidateQueries({ queryKey: ['budget_status', wsId] });
      onSuccess?.();
    },
    onError: () => {
      toast.error(t('failed_to_save'));
    },
  });

  const onSubmit = async (data: BudgetFormValues) => {
    await mutation.mutateAsync({
      name: data.name,
      description: data.description || null,
      amount: parseFloat(data.amount),
      period: data.period,
      start_date: data.start_date,
      end_date: data.end_date || null,
      alert_threshold: data.alert_threshold
        ? parseFloat(data.alert_threshold)
        : 80,
      category_id:
        data.category_id && data.category_id !== NO_CATEGORY_VALUE
          ? data.category_id
          : null,
      wallet_id:
        data.wallet_id && data.wallet_id !== NO_WALLET_VALUE
          ? data.wallet_id
          : null,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <BudgetBasicsFields form={form} />
        <BudgetAmountFields form={form} />
        <BudgetPeriodField form={form} />
        <BudgetScopeFields
          categories={categories}
          form={form}
          isLoadingCategories={isLoadingCategories}
          isLoadingWallets={isLoadingWallets}
          wallets={wallets}
        />
        <BudgetDateFields form={form} />
        <BudgetSubmitButton
          isEditing={!!budgetId}
          isPending={mutation.isPending}
        />
      </form>
    </Form>
  );
}
