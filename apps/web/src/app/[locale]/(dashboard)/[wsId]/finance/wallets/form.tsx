'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Wallet } from '@tuturuuu/types/primitives/Wallet';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Wallet;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  balance: z.number().optional(),
  type: z.enum(['STANDARD', 'CREDIT']),
  currency: z.enum(['VND']),
});

export function WalletForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      balance: data?.balance || 0,
      type: data?.type || 'STANDARD',
      currency: data?.currency || 'VND',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/wallets/${data.id}`
        : `/api/workspaces/${wsId}/wallets`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating wallet',
        description: 'An error occurred while creating the wallet',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <FormField
          control={form.control}
          name="name"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.wallet_name')}</FormLabel>
              <FormControl>
                <Input placeholder="Cash" {...field} />
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
                    if (!isNaN(numericValue)) {
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

        <div className="flex gap-2">
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
                    defaultValue="STANDARD"
                    options={[
                      {
                        value: 'STANDARD',
                        label: t('wallet-data-table.standard'),
                      },
                      {
                        value: 'CREDIT',
                        label: t('wallet-data-table.credit'),
                        disabled: true,
                      },
                    ]}
                    classNames={{ root: 'w-full' }}
                    {...field}
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
                <FormLabel>{t('wallet-data-table.currency')}</FormLabel>
                <FormControl>
                  <SelectField
                    id="wallet-currency"
                    defaultValue="VND"
                    placeholder="Select a currency"
                    options={[
                      { value: 'VND', label: 'VND' },
                      { value: 'USD', label: 'USD', disabled: true },
                    ]}
                    classNames={{ root: 'w-full' }}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="h-2" />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : !!data?.id
              ? t('ws-wallets.edit')
              : t('ws-wallets.create')}
        </Button>
      </form>
    </Form>
  );
}
