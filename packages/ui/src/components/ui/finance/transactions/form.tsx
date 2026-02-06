'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarIcon,
  Coins,
  CreditCard,
  FileText,
  FolderOpen,
  Lock,
  Settings2,
  Wallet,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { CurrencyInput } from '@tuturuuu/ui/currency-input';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
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
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { fetcher } from '@tuturuuu/utils/fetcher';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import * as z from 'zod';
import { getWalletImagePath } from '../wallets/wallet-images';

// Helper to get category icon - extracted to avoid lint warnings about JSX in iterables
function getCategoryIcon(
  category: TransactionCategory,
  iconGetter: typeof getIconComponentByKey
): React.ReactNode {
  const IconComponent = category.icon
    ? iconGetter(category.icon as PlatformIconKey)
    : null;

  if (IconComponent) {
    return <IconComponent className="h-4 w-4" />;
  }
  if (category.is_expense === false) {
    return <ArrowUpCircle className="h-4 w-4" />;
  }
  return <ArrowDownCircle className="h-4 w-4" />;
}

// Helper to get wallet icon - supports custom images, lucide icons, and type-based fallbacks
function getWalletIcon(
  wallet: WalletType,
  iconGetter: typeof getIconComponentByKey
): React.ReactNode {
  // Priority 1: Custom image (bank/mobile logos)
  if (wallet.image_src) {
    return (
      <Image
        src={getWalletImagePath(wallet.image_src)}
        alt=""
        className="h-4 w-4 rounded-sm object-contain"
        height={16}
        width={16}
      />
    );
  }
  // Priority 2: Custom lucide icon
  if (wallet.icon) {
    const IconComponent = iconGetter(wallet.icon as PlatformIconKey);
    if (IconComponent) {
      return <IconComponent className="h-4 w-4" />;
    }
  }
  // Priority 3: Fallback based on wallet type
  return wallet.type === 'CREDIT' ? (
    <CreditCard className="h-4 w-4" />
  ) : (
    <Wallet className="h-4 w-4" />
  );
}

interface Props {
  wsId: string;
  data?: Transaction;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateTransactions?: boolean;
  canUpdateTransactions?: boolean;
  canCreateConfidentialTransactions?: boolean;
  canUpdateConfidentialTransactions?: boolean;
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
  is_amount_confidential: z.boolean().optional(),
  is_description_confidential: z.boolean().optional(),
  is_category_confidential: z.boolean().optional(),
});

export function TransactionForm({
  wsId,
  data,
  onFinish,
  canCreateTransactions,
  canUpdateTransactions,
  canCreateConfidentialTransactions,
  canUpdateConfidentialTransactions,
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

  const { data: wallets, isLoading: walletsLoading } = useQuery<WalletType[]>({
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

  // Fetch default wallet and category from workspace settings (only for new transactions)
  const { data: defaultWalletId } = useWorkspaceConfig<string>(
    wsId,
    'default_wallet_id',
    ''
  );

  const { data: defaultCategoryId } = useWorkspaceConfig<string>(
    wsId,
    'default_category_id',
    ''
  );

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
      tag_ids: [],
      is_amount_confidential: (data as any)?.is_amount_confidential || false,
      is_description_confidential:
        (data as any)?.is_description_confidential || false,
      is_category_confidential:
        (data as any)?.is_category_confidential || false,
    },
  });

  // Update tag_ids when existingTags loads (async query completes after form init)
  useEffect(() => {
    if (existingTags && existingTags.length > 0) {
      const tagIds = existingTags.map((t) => t.tag_id);
      form.setValue('tag_ids', tagIds);
    }
  }, [existingTags, form]);

  // Set default wallet when config/wallets load (only for new transactions without wallet)
  useEffect(() => {
    // Skip if editing existing transaction or wallet already set
    if (data?.id || form.getValues('origin_wallet_id')) return;
    // Skip if wallets haven't loaded yet
    if (!wallets || wallets.length === 0) return;

    // Use configured default if valid, otherwise fall back to first wallet
    const targetWalletId =
      defaultWalletId && wallets.some((w) => w.id === defaultWalletId)
        ? defaultWalletId
        : wallets[0]?.id;

    if (targetWalletId) {
      form.setValue('origin_wallet_id', targetWalletId);
    }
  }, [defaultWalletId, data?.id, form, wallets]);

  // Set default category when config/categories load (only for new transactions without category)
  useEffect(() => {
    // Skip if editing existing transaction or category already set
    if (data?.id || form.getValues('category_id')) return;
    // Skip if categories haven't loaded yet or no default configured
    if (!categories || categories.length === 0 || !defaultCategoryId) return;

    // Use configured default if valid
    if (categories.some((c) => c.id === defaultCategoryId)) {
      form.setValue('category_id', defaultCategoryId);
    }
  }, [defaultCategoryId, data?.id, form, categories]);

  // Check permissions for form interaction
  const hasCreatePermission = canCreateTransactions && !data?.id;
  const hasUpdatePermission = canUpdateTransactions && data?.id;
  const hasFormPermission = hasCreatePermission || hasUpdatePermission;

  // Derive currency suffix from selected wallet
  const selectedWalletId = form.watch('origin_wallet_id');
  const selectedWalletCurrency = useMemo(
    () => wallets?.find((w) => w.id === selectedWalletId)?.currency,
    [wallets, selectedWalletId]
  );

  // Check confidential transaction permissions
  const canManageConfidential =
    (hasCreatePermission && canCreateConfidentialTransactions) ||
    (hasUpdatePermission && canUpdateConfidentialTransactions);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    // Check permissions before submitting
    if (!hasFormPermission) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

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
    'wallet' | 'transaction-category' | 'tag' | undefined
  >();
  const [newContent, setNewContent] = useState<
    | WalletType
    | TransactionCategory
    | { name: string; color?: string }
    | undefined
  >(undefined);
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  // Preset colors for quick tag creation
  const PRESET_TAG_COLORS = [
    '#ef4444',
    '#f97316',
    '#84cc16',
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
  ];

  const handleCreateTag = async () => {
    if (!newContent || !('name' in newContent) || !newContent.name) return;

    try {
      const res = await fetch(`/api/workspaces/${wsId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContent.name,
          color: newTagColor,
        }),
      });

      if (res.ok) {
        const createdTag = await res.json();
        queryClient.invalidateQueries({
          queryKey: [`/api/workspaces/${wsId}/tags`],
        });
        // Add the new tag to the selection
        const currentTags = form.getValues('tag_ids') || [];
        form.setValue('tag_ids', [...currentTags, createdTag.id]);
        setNewContent(undefined);
        setNewContentType(undefined);
        toast.success(t('ws-tags.created'));
      } else {
        toast.error(t('ws-tags.error_creating'));
      }
    } catch {
      toast.error(t('ws-tags.error_creating'));
    }
  };

  return (
    <Dialog
      open={!!newContent}
      onOpenChange={(open) =>
        setNewContent(open ? newContent || {} : undefined)
      }
    >
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {newContentType === 'wallet'
              ? t('ws-wallets.create')
              : newContentType === 'tag'
                ? t('ws-tags.create')
                : t('ws-transaction-categories.create')}
          </DialogTitle>
        </DialogHeader>
        {newContentType === 'wallet' ? (
          <WalletForm
            wsId={wsId}
            data={newContent as WalletType}
            onFinish={() => {
              setNewContent(undefined);
              setNewContentType(undefined);
              queryClient.invalidateQueries({
                queryKey: [`/api/workspaces/${wsId}/wallets`],
              });
            }}
          />
        ) : newContentType === 'tag' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="font-medium text-sm">{t('ws-tags.name')}</label>
              <Input
                value={(newContent as { name: string })?.name || ''}
                onChange={(e) => setNewContent({ name: e.target.value })}
                placeholder={t('ws-tags.name_placeholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">
                {t('ws-tags.color')}
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                      newTagColor === color
                        ? 'border-foreground'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleCreateTag} className="w-full">
              {t('ws-tags.create')}
            </Button>
          </div>
        ) : (
          <TransactionCategoryForm
            wsId={wsId}
            data={newContent as TransactionCategory}
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
          className="flex flex-col space-y-3"
        >
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="mb-3 grid w-full grid-cols-2">
              <TabsTrigger value="basic" className="gap-1.5">
                <Wallet className="h-4 w-4" />
                {t('transaction-data-table.tab_basic')}
              </TabsTrigger>
              <TabsTrigger value="more" className="gap-1.5">
                <Settings2 className="h-4 w-4" />
                {t('transaction-data-table.tab_more')}
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Basic - Essential fields */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="origin_wallet_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        {t('transaction-data-table.wallet')}
                      </FormLabel>
                      <Combobox
                        t={t}
                        {...field}
                        mode="single"
                        options={
                          wallets
                            ? wallets.map((wallet) => ({
                                value: wallet.id || '',
                                label: wallet.name || '',
                                icon: getWalletIcon(
                                  wallet,
                                  getIconComponentByKey
                                ),
                              }))
                            : []
                        }
                        label={walletsLoading ? 'Loading...' : undefined}
                        placeholder={t('transaction-data-table.select_wallet')}
                        selected={field.value ?? ''}
                        onChange={field.onChange}
                        onCreate={(name) => {
                          setNewContentType('wallet');
                          setNewContent({
                            name,
                          });
                        }}
                        disabled={
                          loading || walletsLoading || !hasFormPermission
                        }
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
                      <FormLabel>
                        {t('transaction-data-table.category')}
                      </FormLabel>
                      <Combobox
                        t={t}
                        {...field}
                        mode="single"
                        options={
                          categories
                            ? categories.map((category) => ({
                                value: category.id || '',
                                label: category.name || '',
                                icon: getCategoryIcon(
                                  category,
                                  getIconComponentByKey
                                ),
                                color: category.color
                                  ? computeAccessibleLabelStyles(category.color)
                                      ?.text
                                  : undefined,
                              }))
                            : []
                        }
                        label={categoriesLoading ? 'Loading...' : undefined}
                        placeholder={t(
                          'transaction-data-table.select_category'
                        )}
                        selected={field.value ?? ''}
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

              <FormField
                control={form.control}
                name="amount"
                disabled={loading || !hasFormPermission}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('transaction-data-table.amount')}</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                        disabled={field.disabled}
                        placeholder="0"
                        currencySuffix={selectedWalletCurrency}
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
                    <FormLabel>
                      {t('transaction-data-table.description')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          'transaction-data-table.description_placeholder'
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Popover>
                <FormField
                  control={form.control}
                  name="taken_at"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        {t('transaction-data-table.taken_at')}
                      </FormLabel>
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
                              <span>
                                {t('transaction-data-table.taken_at')}
                              </span>
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
            </TabsContent>

            {/* Tab 2: More - Tags, Report, and Confidential settings */}
            <TabsContent value="more" className="space-y-4">
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
                              color: tag.color,
                            }))
                          : []
                      }
                      label={tagsLoading ? 'Loading...' : undefined}
                      placeholder={
                        !tagsLoading && (!tags || tags.length === 0)
                          ? t('transaction-data-table.no_tags_hint')
                          : t('transaction-data-table.select_tags')
                      }
                      selected={field.value || []}
                      onChange={field.onChange}
                      onCreate={(name) => {
                        setNewContentType('tag');
                        setNewContent({ name });
                      }}
                      disabled={loading || tagsLoading || !hasFormPermission}
                    />
                    <FormDescription>
                      {t('transaction-data-table.tags_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="report_opt_in"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">
                        {t('transaction-data-table.report_opt_in')}
                      </FormLabel>
                      <FormDescription className="text-xs">
                        {t('transaction-data-table.report_opt_in_description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!hasFormPermission}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {canManageConfidential && (
                <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-dynamic-orange" />
                    <span className="font-medium text-sm">
                      {t('workspace-finance-transactions.mark-as-confidential')}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="is_amount_confidential"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Coins className="h-4 w-4 text-muted-foreground" />
                            <FormLabel className="mt-0! font-normal text-sm">
                              {t(
                                'workspace-finance-transactions.confidential-amount'
                              )}
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Checkbox
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                              disabled={loading}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_description_confidential"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <FormLabel className="mt-0! font-normal text-sm">
                              {t(
                                'workspace-finance-transactions.confidential-description'
                              )}
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Checkbox
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                              disabled={loading}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_category_confidential"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            <FormLabel className="mt-0! font-normal text-sm">
                              {t(
                                'workspace-finance-transactions.confidential-category'
                              )}
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Checkbox
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                              disabled={loading}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

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
