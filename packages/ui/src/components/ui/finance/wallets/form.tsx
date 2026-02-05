'use client';

import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { useWorkspaceCurrency } from '@tuturuuu/ui/hooks/use-workspace-currency';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { SUPPORTED_CURRENCIES } from '@tuturuuu/utils/currencies';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import * as z from 'zod';
import { toast } from '../../sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../tabs';
import { WalletIconImagePicker } from './wallet-icon-image-picker';
import WalletRoleAccess from './walletId/wallet-role-access';

interface Props {
  wsId: string;
  data?: Wallet;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  isPersonalWorkspace?: boolean;
}

const FormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    description: z.string().max(500).optional(),
    balance: z.number().optional(),
    type: z.string(),
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
          message: 'Credit limit is required for credit wallets',
        });
      }
      if (!data.statement_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['statement_date'],
          message: 'Statement date is required for credit wallets',
        });
      }
      if (!data.payment_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payment_date'],
          message: 'Payment date is required for credit wallets',
        });
      }
    }
  });

export function WalletForm({
  wsId,
  data,
  onFinish,
  isPersonalWorkspace,
}: Props) {
  const t = useTranslations();
  const { currency: workspaceCurrency } = useWorkspaceCurrency(wsId);

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Local state for immediate UI updates (icon/image)
  const [localIcon, setLocalIcon] = useState<string | null>(data?.icon || null);
  const [localImageSrc, setLocalImageSrc] = useState<string | null>(
    data?.image_src || null
  );

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      description: data?.description || '',
      balance: data?.balance || 0,
      type: data?.type || 'STANDARD',
      currency: data?.currency || workspaceCurrency || 'USD',
      icon: data?.icon || null,
      image_src: data?.image_src || null,
      limit: data?.limit ?? undefined,
      statement_date: data?.statement_date ?? undefined,
      payment_date: data?.payment_date ?? undefined,
    },
  });

  const walletType = useWatch({ control: form.control, name: 'type' });

  // Handle icon change - update both local state and form
  const handleIconChange = useCallback(
    (value: string | null) => {
      setLocalIcon(value);
      form.setValue('icon', value);
    },
    [form]
  );

  // Handle image_src change - update both local state and form
  const handleImageSrcChange = useCallback(
    (value: string | null) => {
      setLocalImageSrc(value);
      form.setValue('image_src', value);
    },
    [form]
  );

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      formData?.id
        ? `/api/workspaces/${wsId}/wallets/${formData.id}`
        : `/api/workspaces/${wsId}/wallets`,
      {
        method: formData?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          icon: formData.icon || null,
          image_src: formData.image_src || null,
        }),
      }
    );

    if (res.ok) {
      onFinish?.(formData);
      router.refresh();
    } else {
      setLoading(false);
      toast.error(t('ws-wallets.failed_to_create_wallet'));
    }
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="icon"
            render={() => (
              <FormItem>
                <FormLabel>{t('wallet-data-table.icon')}</FormLabel>
                <FormControl>
                  <WalletIconImagePicker
                    icon={localIcon}
                    imageSrc={localImageSrc}
                    onIconChange={handleIconChange}
                    onImageSrcChange={handleImageSrcChange}
                    disabled={loading}
                    translations={{
                      selectIconOrImage: t(
                        'wallet-data-table.select_icon_or_image'
                      ),
                      iconTab: t('wallet-data-table.icon_tab'),
                      bankTab: t('wallet-data-table.bank_tab'),
                      mobileTab: t('wallet-data-table.mobile_tab'),
                      searchPlaceholder: t('wallet-data-table.search'),
                      clear: t('common.clear'),
                      selectIcon: t('wallet-data-table.select_icon'),
                      iconDescription: t('wallet-data-table.icon_description'),
                      searchIcons: t('wallet-data-table.search_icons'),
                      noIcon: t('wallet-data-table.no_icon'),
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            disabled={loading}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('wallet-data-table.wallet_name')}</FormLabel>
                <FormControl>
                  <Input placeholder="Cash" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.description')}</FormLabel>
              <FormControl>
                <Input placeholder="Personal savings" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
                    !field.value
                      ? ''
                      : new Intl.NumberFormat('en-US', {
                          maximumFractionDigits: 2,
                        }).format(Math.abs(field.value))
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
                  placeholder="Select a type"
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
                  onValueChange={field.onChange}
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
          <div className="space-y-2 rounded-lg border p-3">
            <div className="font-medium text-sm">
              {t('wallet-data-table.credit_details')}
            </div>

            <FormField
              control={form.control}
              name="limit"
              disabled={loading}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('wallet-data-table.credit_limit')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        field.onChange(Number.isNaN(val) ? undefined : val);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="statement_date"
                disabled={loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('wallet-data-table.statement_date')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="1"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? undefined : val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_date"
                disabled={loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('wallet-data-table.payment_date')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="1"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? undefined : val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
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
