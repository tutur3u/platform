'use client';

import { Wallet } from '@/types/primitives/Wallet';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { SelectField } from '@repo/ui/components/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Wallet;
  onComplete?: () => void;
  submitLabel?: string;
}

const FormSchema = z.object({
  name: z.string().min(1).max(255),
  balance: z.number().optional(),
  type: z.enum(['STANDARD', 'CREDIT']),
  currency: z.enum(['VND']),
});

export function WalletForm({ wsId, data, onComplete, submitLabel }: Props) {
  const { t } = useTranslation('wallet-data-table');

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: data?.name || '',
      balance: data?.balance || 0,
      type: data?.type || 'STANDARD',
      currency: data?.currency || 'VND',
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
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
        body: JSON.stringify(formData),
      }
    );

    if (res.ok) {
      router.refresh();
      if (onComplete) onComplete();
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
              <FormLabel>{t('wallet_name')}</FormLabel>
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
              <FormLabel>{t('wallet_balance')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
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
                <FormLabel>{t('wallet_type')}</FormLabel>
                <FormControl>
                  <SelectField
                    id="wallet-type"
                    placeholder="Select a type"
                    defaultValue="STANDARD"
                    options={[
                      { value: 'STANDARD', label: t('standard') },
                      { value: 'CREDIT', label: t('credit'), disabled: true },
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
                <FormLabel>{t('currency')}</FormLabel>
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
          {loading ? t('common:processing') : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
