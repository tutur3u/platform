'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createWallet, updateWallet } from '@tuturuuu/internal-api/finance';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { useWorkspaceCurrency } from '@tuturuuu/ui/hooks/use-workspace-currency';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  getCurrencyLocale,
  SUPPORTED_CURRENCIES,
} from '@tuturuuu/utils/currencies';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import * as z from 'zod';
import { toast } from '../../sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../tabs';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';
import { invalidateWalletMutationQueries } from './query-invalidation';
import { WalletBasicsFields } from './wallet-basics-fields';
import { WalletCreditFields } from './wallet-credit-fields';
import WalletRoleAccess from './walletId/wallet-role-access';

const walletValidationMessageKeys = {
  creditLimitRequired: 'wallet-data-table.credit_limit_required',
  paymentDateRequired: 'wallet-data-table.payment_date_required',
  statementDateRequired: 'wallet-data-table.statement_date_required',
} as const;

type WalletValidationMessageKey =
  (typeof walletValidationMessageKeys)[keyof typeof walletValidationMessageKeys];

const createWalletFormSchema = (
  t: (key: WalletValidationMessageKey) => string
) =>
  z
    .object({
      id: z.string().optional(),
      name: z.string().min(1).max(255),
      description: z.string().max(500).optional(),
      balance: z.number().optional(),
      type: z.enum(['STANDARD', 'CREDIT']),
      currency: z.string().min(1),
      icon: z.string().nullable().optional(),
      image_src: z.string().nullable().optional(),
      limit: z.number().positive().optional(),
      statement_date: z.number().min(1).max(31).optional(),
      payment_date: z.number().min(1).max(31).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.type === 'CREDIT') {
        if (!data.limit || data.limit <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['limit'],
            message: t(walletValidationMessageKeys.creditLimitRequired),
          });
        }
        if (!data.statement_date) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['statement_date'],
            message: t(walletValidationMessageKeys.statementDateRequired),
          });
        }
        if (!data.payment_date) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payment_date'],
            message: t(walletValidationMessageKeys.paymentDateRequired),
          });
        }
      }
    });

export type WalletFormValues = z.infer<
  ReturnType<typeof createWalletFormSchema>
>;

interface Props {
  wsId: string;
  data?: Wallet;
  defaultType?: WalletFormValues['type'];
  onFinish?: (data: WalletFormValues) => void;
  isPersonalWorkspace?: boolean;
}

export function WalletForm({
  wsId,
  data,
  defaultType = 'STANDARD',
  onFinish,
  isPersonalWorkspace,
}: Props) {
  const t = useTranslations();
  const { currency: workspaceCurrency } = useWorkspaceCurrency(wsId);
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const formSchema = useMemo(() => createWalletFormSchema(t), [t]);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      description: data?.description || '',
      balance: data?.balance || 0,
      type: data?.type || defaultType,
      currency: data?.currency || workspaceCurrency || 'USD',
      icon: data?.icon || null,
      image_src: data?.image_src || null,
      limit: data?.limit ?? undefined,
      statement_date:
        data?.statement_date ?? (defaultType === 'CREDIT' ? 1 : undefined),
      payment_date:
        data?.payment_date ?? (defaultType === 'CREDIT' ? 15 : undefined),
    },
  });

  const walletType = useWatch({ control: form.control, name: 'type' });
  const walletCurrency = useWatch({ control: form.control, name: 'currency' });

  async function onSubmit(formData: WalletFormValues) {
    setLoading(true);

    try {
      const payload = {
        ...formData,
        icon: formData.icon || null,
        image_src: formData.image_src || null,
      };

      if (formData.id) {
        await updateWallet(wsId, formData.id, payload);
      } else {
        await createWallet(wsId, payload);
      }

      await invalidateWalletMutationQueries(queryClient, wsId);
      onFinish?.(formData);
      router.refresh();
    } catch {
      setLoading(false);
      toast.error(t('ws-wallets.failed_to_create_wallet'));
    }
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <WalletBasicsFields
          form={form}
          loading={loading}
          defaultIcon={data?.icon}
          defaultImageSrc={data?.image_src}
        />

        <FormField
          control={form.control}
          name="balance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.wallet_balance')}</FormLabel>
              <FormControl>
                <Input
                  placeholder="0"
                  {...field}
                  value={
                    areNumbersHidden
                      ? FINANCE_HIDDEN_AMOUNT
                      : !field.value
                        ? ''
                        : new Intl.NumberFormat(
                            getCurrencyLocale(
                              walletCurrency || workspaceCurrency || 'USD'
                            ),
                            {
                              maximumFractionDigits: 2,
                            }
                          ).format(Math.abs(field.value))
                  }
                  onChange={(e) => {
                    // Remove non-numeric characters except decimal point, then parse
                    const numericValue = parseFloat(
                      e.target.value.replace(/[^0-9.]/g, '')
                    );
                    if (!Number.isNaN(numericValue)) {
                      field.onChange(numericValue);
                    } else {
                      // Handle case where the input is not a number (e.g., all non-numeric characters are deleted)
                      field.onChange(0);
                    }
                  }}
                  disabled
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
          // disabled={loading}
          disabled
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormLabel>{t('wallet-data-table.wallet_type')}</FormLabel>
              <FormControl>
                <SelectField
                  id="wallet-type"
                  placeholder={t('wallet-data-table.select_type')}
                  options={[
                    {
                      value: 'STANDARD',
                      label: t('wallet-data-table.standard'),
                    },
                    {
                      value: 'CREDIT',
                      label: t('wallet-data-table.credit'),
                    },
                  ]}
                  classNames={{ root: 'w-full' }}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);

                    if (value === 'CREDIT') {
                      if (!form.getValues('statement_date')) {
                        form.setValue('statement_date', 1);
                      }
                      if (!form.getValues('payment_date')) {
                        form.setValue('payment_date', 15);
                      }
                    }
                  }}
                />
              </FormControl>
              <FormDescription>
                {walletType === 'CREDIT'
                  ? t('wallet-data-table.wallet_type_credit_description')
                  : t('wallet-data-table.wallet_type_standard_description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormLabel>{t('wallet-data-table.wallet_currency')}</FormLabel>
              <FormControl>
                <SelectField
                  id="wallet-currency"
                  placeholder={t('wallet-data-table.select_currency')}
                  options={SUPPORTED_CURRENCIES.map((c) => ({
                    value: c.code,
                    label: `${c.code} - ${c.name}`,
                  }))}
                  classNames={{ root: 'w-full' }}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {walletType === 'CREDIT' && (
          <WalletCreditFields
            form={form}
            loading={loading}
            currency={walletCurrency || workspaceCurrency || 'USD'}
          />
        )}

        <div className="h-2" />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : data?.id
              ? t('ws-wallets.edit')
              : t('ws-wallets.create')}
        </Button>
      </form>
    </Form>
  );

  // If personal workspace or no data.id, only show form (no tabs needed for role access)
  if (!data?.id || isPersonalWorkspace) return formContent;

  return (
    <Tabs defaultValue="general">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="general">{t('common.general')}</TabsTrigger>
        <TabsTrigger value="role_access">
          {t('ws-wallets.role_access')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="mt-4">
        {formContent}
      </TabsContent>
      <TabsContent value="role_access" className="mt-4">
        <WalletRoleAccess wsId={wsId} walletId={data.id} />
      </TabsContent>
    </Tabs>
  );
}
