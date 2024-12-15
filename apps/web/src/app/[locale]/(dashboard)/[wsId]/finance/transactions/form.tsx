'use client';

import { WalletForm } from '../wallets/form';
import { TransactionCategoryForm } from './categories/form';
import { Transaction } from '@/types/primitives/Transaction';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { Wallet } from '@/types/primitives/Wallet';
import { fetcher } from '@/utils/fetcher';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Calendar } from '@repo/ui/components/ui/calendar';
import { Combobox } from '@repo/ui/components/ui/custom/combobox';
import { Dialog, DialogContent } from '@repo/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import { Separator } from '@repo/ui/components/ui/separator';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { toast } from '@repo/ui/hooks/use-toast';
import { cn } from '@repo/ui/lib/utils';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Transaction;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().positive(),
  origin_wallet_id: z.string().min(1),
  destination_wallet_id: z.string().optional(),
  category_id: z.string().min(1),
  taken_at: z.date(),
  report_opt_in: z.boolean(),
});

export function TransactionForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();
  const locale = useLocale();

  // const [mode, setMode] = useState<'standard' | 'transfer'>('standard');

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const {
    data: categories,
    error: categoriesError,
    mutate: mutateCategories,
  } = useSWR<TransactionCategory[]>(
    `/api/workspaces/${wsId}/transactions/categories`,
    fetcher
  );

  const categoriesLoading = !categories && !categoriesError;

  const {
    data: wallets,
    error: walletsError,
    mutate: mutateWallets,
  } = useSWR<Wallet[]>(`/api/workspaces/${wsId}/wallets`, fetcher);

  const walletsLoading = !wallets && !walletsError;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      description: data?.description || '',
      amount: data?.amount ? Math.abs(data.amount) : undefined,
      origin_wallet_id: data?.wallet_id || wallets?.[0]?.id || '',
      category_id: data?.category_id || '',
      taken_at: data?.taken_at ? new Date(data.taken_at) : new Date(),
      report_opt_in: data?.report_opt_in || true,
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/transactions/${data.id}`
        : `/api/workspaces/${wsId}/transactions`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          amount:
            categories?.find((c) => c.id === data.category_id)?.is_expense ===
            false
              ? Math.abs(data.amount)
              : -Math.abs(data.amount),
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating category',
        description: 'An error occurred while creating the category',
      });
    }
  }

  const [newContentType, setNewContentType] = useState<
    'wallet' | 'transaction-category' | undefined
  >();
  const [newContent, setNewContent] = useState<
    Wallet | TransactionCategory | undefined
  >(undefined);

  return (
    <Dialog
      open={!!newContent}
      onOpenChange={(open) =>
        setNewContent(open ? newContent || {} : undefined)
      }
    >
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        {newContentType === 'wallet' ? (
          <WalletForm
            wsId={wsId}
            data={newContent}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              mutateWallets();
            }}
          />
        ) : (
          <TransactionCategoryForm
            wsId={wsId}
            data={newContent}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              mutateCategories();
            }}
          />
        )}
      </DialogContent>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col space-y-2"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <FormField
              control={form.control}
              name="origin_wallet_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('transaction-data-table.wallet')}</FormLabel>
                  <Combobox
                    t={t}
                    {...field}
                    mode="single"
                    options={
                      wallets
                        ? wallets.map((wallet) => ({
                            value: wallet.id!,
                            label: wallet.name || '',
                          }))
                        : []
                    }
                    label={walletsLoading ? 'Loading...' : undefined}
                    placeholder={t('transaction-data-table.select_wallet')}
                    selected={field.value}
                    onChange={field.onChange}
                    onCreate={(name) => {
                      setNewContentType('wallet');
                      setNewContent({
                        name,
                      });
                    }}
                    disabled={loading || walletsLoading}
                    useFirstValueAsDefault
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('transaction-data-table.category')}</FormLabel>
                  <Combobox
                    t={t}
                    {...field}
                    mode="single"
                    options={
                      categories
                        ? categories.map((category) => ({
                            value: category.id!,
                            label: category.name || '',
                          }))
                        : []
                    }
                    label={walletsLoading ? 'Loading...' : undefined}
                    placeholder={t('transaction-data-table.select_category')}
                    selected={field.value}
                    onChange={field.onChange}
                    onCreate={(name) => {
                      setNewContentType('transaction-category');
                      setNewContent({
                        name,
                      });
                    }}
                    disabled={loading || categoriesLoading}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="h-0" />
          <Separator />

          <FormField
            control={form.control}
            name="amount"
            disabled={loading}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('transaction-data-table.amount')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="0"
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
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            disabled={loading}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('transaction-data-table.description')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('transaction-data-table.description')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="h-0" />

          <Popover>
            <FormField
              control={form.control}
              name="taken_at"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('transaction-data-table.taken_at')}</FormLabel>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          'pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(
                            field.value,
                            locale === 'vi' ? 'dd/MM/yyyy, ppp' : 'PPP',
                            {
                              locale: locale === 'vi' ? vi : enUS,
                            }
                          )
                        ) : (
                          <span>{t('transaction-data-table.taken_at')}</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      onSubmit={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Popover>

          <div className="h-2" />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? t('common.processing')
              : data?.id
                ? t('ws-transactions.edit')
                : t('ws-transactions.create')}
          </Button>
        </form>
      </Form>
    </Dialog>
  );
}
