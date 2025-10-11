'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Dialog, DialogContent } from '@tuturuuu/ui/dialog';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/sonner';
import { CalendarIcon } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { fetcher } from '@tuturuuu/utils/fetcher';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { createClient } from '@tuturuuu/supabase/next/client';

interface Props {
  wsId: string;
  data?: Transaction;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateTransactions?: boolean;
  canUpdateTransactions?: boolean;
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
  tag_ids: z.array(z.string()).optional(),
});

export function TransactionForm({
  wsId,
  data,
  onFinish,
  canCreateTransactions,
  canUpdateTransactions,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { data: categories, isLoading: categoriesLoading } = useQuery<
    TransactionCategory[]
  >({
    queryKey: [`/api/workspaces/${wsId}/transactions/categories`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/transactions/categories`),
  });

  const { data: wallets, isLoading: walletsLoading } = useQuery<Wallet[]>({
    queryKey: [`/api/workspaces/${wsId}/wallets`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/wallets`),
  });

  const { data: tags, isLoading: tagsLoading } = useQuery<
    Array<{ id: string; name: string; color: string }>
  >({
    queryKey: [`/api/workspaces/${wsId}/tags`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/tags`),
  });

  // Fetch existing tags for this transaction if editing
  const { data: existingTags } = useQuery<Array<{ tag_id: string }>>({
    queryKey: [`/api/workspaces/${wsId}/transactions/${data?.id}/tags`],
    queryFn: () =>
      fetcher(`/api/workspaces/${wsId}/transactions/${data?.id}/tags`),
    enabled: !!data?.id,
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      description: data?.description || '',
      amount: data?.amount ? Math.abs(data.amount) : undefined,
      origin_wallet_id: data?.wallet_id || wallets?.[0]?.id || '',
      category_id: data?.category_id || '',
      taken_at: data?.taken_at ? new Date(data.taken_at) : new Date(),
      report_opt_in: data?.report_opt_in || true,
      tag_ids: existingTags?.map((t) => t.tag_id) || [],
    },
  });

  // Check permissions for form interaction
  const hasCreatePermission = canCreateTransactions && !data?.id;
  const hasUpdatePermission = canUpdateTransactions && data?.id;
  const hasFormPermission = hasCreatePermission || hasUpdatePermission;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    // Check permissions before submitting
    if (!hasFormPermission) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

    setLoading(true);

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      toast.error(t('common.insufficient_permissions'));
      return;
    }

    const { data: wsUser } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('ws_id', wsId)
      .single();

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
          creator_id: wsUser?.virtual_user_id,
        }),
      }
    );

    if (res.ok) {
      // Invalidate transaction-related queries to refresh any transaction lists
      // queryClient.invalidateQueries({
      //   queryKey: [`/api/workspaces/${wsId}/transactions`],
      // });
      queryClient.invalidateQueries({
        queryKey: [`/api/workspaces/${wsId}/transactions/infinite`],
      });
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast.error(t('transaction-data-table.error_creating_transaction'));
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
              queryClient.invalidateQueries({
                queryKey: [`/api/workspaces/${wsId}/wallets`],
              });
            }}
          />
        ) : (
          <TransactionCategoryForm
            wsId={wsId}
            data={newContent}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              queryClient.invalidateQueries({
                queryKey: [`/api/workspaces/${wsId}/transactions/categories`],
              });
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
                            value: wallet.id || '',
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
                    disabled={loading || walletsLoading || !hasFormPermission}
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
                            value: category.id || '',
                            label: category.name || '',
                          }))
                        : []
                    }
                    label={categoriesLoading ? 'Loading...' : undefined}
                    placeholder={t('transaction-data-table.select_category')}
                    selected={field.value}
                    onChange={field.onChange}
                    onCreate={(name) => {
                      setNewContentType('transaction-category');
                      setNewContent({
                        name,
                      });
                    }}
                    disabled={
                      loading || categoriesLoading || !hasFormPermission
                    }
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
            disabled={loading || !hasFormPermission}
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
                      if (!Number.isNaN(numericValue)) {
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
            disabled={loading || !hasFormPermission}
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

          <FormField
            control={form.control}
            name="tag_ids"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{t('transaction-data-table.tags')}</FormLabel>
                <Combobox
                  t={t}
                  {...field}
                  mode="multiple"
                  options={
                    tags
                      ? tags.map((tag) => ({
                          value: tag.id || '',
                          label: tag.name || '',
                        }))
                      : []
                  }
                  label={tagsLoading ? 'Loading...' : undefined}
                  placeholder={t('transaction-data-table.select_tags')}
                  selected={field.value || []}
                  onChange={field.onChange}
                  disabled={loading || tagsLoading || !hasFormPermission}
                />
                <FormDescription>
                  {t('transaction-data-table.tags_description')}
                </FormDescription>
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
                        disabled={!hasFormPermission}
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

          <FormField
            control={form.control}
            name="report_opt_in"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center space-x-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!hasFormPermission}
                    />
                  </FormControl>
                  <FormLabel>
                    {t('transaction-data-table.report_opt_in')}
                  </FormLabel>
                </div>
                <FormDescription>
                  {t('transaction-data-table.report_opt_in_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="h-0" />
          <Separator />

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !hasFormPermission}
          >
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
