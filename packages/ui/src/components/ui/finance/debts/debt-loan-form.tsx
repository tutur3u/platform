'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type {
  DebtLoan,
  DebtLoanFormData,
  DebtLoanType,
  InterestCalculationType,
} from '@tuturuuu/types/primitives/DebtLoan';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '../../button';
import { SelectField } from '../../custom/select-field';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../form';
import { Input } from '../../input';
import { toast } from '../../sonner';
import { Textarea } from '../../textarea';

interface Props {
  wsId: string;
  data?: DebtLoan;
  wallets?: Wallet[];
  defaultType?: DebtLoanType;
  onFinish?: (data: DebtLoanFormData) => void;
  onCancel?: () => void;
}

const FormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(500).optional(),
  counterparty: z.string().max(255).optional(),
  type: z.enum(['debt', 'loan']),
  principal_amount: z.number().min(1, 'Amount must be greater than 0'),
  currency: z.string().default('VND'),
  interest_rate: z.number().min(0).max(100).optional(),
  interest_type: z.enum(['simple', 'compound']).optional(),
  start_date: z.string(),
  due_date: z.string().optional(),
  wallet_id: z.string().optional(),
});

export function DebtLoanForm({
  wsId,
  data,
  wallets = [],
  defaultType = 'debt',
  onFinish,
  onCancel,
}: Props) {
  const t = useTranslations('ws-debt-loan');
  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: data?.name || '',
      description: data?.description || '',
      counterparty: data?.counterparty || '',
      type: (data?.type || defaultType) as DebtLoanType,
      principal_amount: data?.principal_amount || 0,
      currency: data?.currency || 'VND',
      interest_rate: data?.interest_rate ?? undefined,
      interest_type: (data?.interest_type || undefined) as
        | InterestCalculationType
        | undefined,
      start_date:
        data?.start_date || new Date().toISOString().split('T')[0] || '',
      due_date: data?.due_date || '',
      wallet_id: data?.wallet_id || '',
    },
  });

  const selectedType = form.watch('type');
  const interestRate = form.watch('interest_rate');

  const handleInterestRateChange = useCallback(
    (value: number | undefined) => {
      if (value === undefined || value === 0) {
        form.setValue('interest_type', undefined);
      }
    },
    [form]
  );

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    try {
      const submitData: DebtLoanFormData = {
        name: formData.name,
        type: formData.type,
        principal_amount: formData.principal_amount,
        currency: formData.currency,
        start_date: formData.start_date,
      };

      if (formData.description) submitData.description = formData.description;
      if (formData.counterparty)
        submitData.counterparty = formData.counterparty;
      if (formData.interest_rate !== undefined)
        submitData.interest_rate = formData.interest_rate;
      if (formData.interest_type)
        submitData.interest_type = formData.interest_type;
      if (formData.due_date) submitData.due_date = formData.due_date;
      if (formData.wallet_id) submitData.wallet_id = formData.wallet_id;

      const res = await fetch(
        data?.id
          ? `/api/v1/workspaces/${wsId}/finance/debts/${data.id}`
          : `/api/v1/workspaces/${wsId}/finance/debts`,
        {
          method: data?.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submitData),
        }
      );

      if (res.ok) {
        toast.success(data?.id ? t('update_success') : t('create_success'));
        onFinish?.(submitData);
      } else {
        const error = await res.json();
        toast.error(error.message || t('error'));
      }
    } catch {
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('type')}</FormLabel>
              <SelectField
                id="type"
                placeholder={t('select_type')}
                options={[
                  { value: 'debt', label: t('debt') },
                  { value: 'loan', label: t('loan') },
                ]}
                classNames={{ selectTrigger: 'w-full' }}
                value={field.value}
                onValueChange={field.onChange}
                disabled={!!data?.id}
              />
              <FormDescription>
                {selectedType === 'debt'
                  ? t('debt_description')
                  : t('loan_description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('name_placeholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="counterparty"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('counterparty')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    selectedType === 'debt'
                      ? t('lender_placeholder')
                      : t('borrower_placeholder')
                  }
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {selectedType === 'debt'
                  ? t('counterparty_debt_description')
                  : t('counterparty_loan_description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="principal_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('principal_amount')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="0"
                    {...field}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? Number(e.target.value) : 0
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('currency')}</FormLabel>
                <SelectField
                  id="currency"
                  placeholder={t('select_currency')}
                  options={[
                    { value: 'VND', label: 'VND' },
                    { value: 'USD', label: 'USD' },
                  ]}
                  classNames={{ selectTrigger: 'w-full' }}
                  value={field.value}
                  onValueChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('start_date')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('due_date')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>{t('due_date_description')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="interest_rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('interest_rate')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="0"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                        ? Number(e.target.value)
                        : undefined;
                      field.onChange(value);
                      handleInterestRateChange(value);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t('interest_rate_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="interest_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('interest_type')}</FormLabel>
                <SelectField
                  id="interest_type"
                  placeholder={t('select_interest_type')}
                  options={[
                    { value: 'simple', label: t('simple_interest') },
                    { value: 'compound', label: t('compound_interest') },
                  ]}
                  classNames={{ selectTrigger: 'w-full' }}
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  disabled={!interestRate || interestRate === 0}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {wallets.length > 0 && (
          <FormField
            control={form.control}
            name="wallet_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('associated_wallet')}</FormLabel>
                <SelectField
                  id="wallet_id"
                  placeholder={t('select_wallet')}
                  options={[
                    { value: 'none', label: t('no_wallet') },
                    ...wallets.map((w) => ({
                      value: w.id || 'none',
                      label: w.name || '',
                    })),
                  ]}
                  classNames={{ selectTrigger: 'w-full' }}
                  value={field.value || 'none'}
                  onValueChange={(value) =>
                    field.onChange(value === 'none' ? '' : value)
                  }
                />
                <FormDescription>
                  {t('associated_wallet_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('description_placeholder')}
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('cancel')}
            </Button>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? t('saving') : data?.id ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
