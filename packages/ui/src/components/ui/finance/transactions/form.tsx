'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Settings2, Wallet } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useExchangeRates } from '@tuturuuu/ui/hooks/use-exchange-rates';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { fetcher } from '@tuturuuu/utils/fetcher';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { FormBasicTab } from './form-basic-tab';
import { FormContentDialog } from './form-content-dialog';
import { FormMoreTab } from './form-more-tab';
import {
  roundTransferAmount,
  TransactionFormSchema,
  type TransactionFormValues,
} from './form-schema';
import type {
  NewContent,
  NewContentType,
  TransactionFormProps,
} from './form-types';

export function TransactionForm({
  wsId,
  data,
  onFinish,
  canCreateTransactions,
  canUpdateTransactions,
  canCreateConfidentialTransactions,
  canUpdateConfidentialTransactions,
}: TransactionFormProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [isTransfer, setIsTransfer] = useState(!!data?.transfer);
  // Start in override mode when editing an existing transfer (preserve stored amounts).
  // Start in auto mode for new transfers so the exchange rate pre-fills destination.
  const [isDestinationOverridden, setIsDestinationOverridden] = useState(
    !!data?.transfer
  );
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

  const { data: existingTags } = useQuery<Array<{ tag_id: string }>>({
    queryKey: [`/api/workspaces/${wsId}/transactions/${data?.id}/tags`],
    queryFn: () =>
      fetcher(`/api/workspaces/${wsId}/transactions/${data?.id}/tags`),
    enabled: !!data?.id,
  });

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
    resolver: zodResolver(TransactionFormSchema),
    defaultValues: {
      id: data?.id,
      description: data?.description || '',
      amount: data?.amount ? Math.abs(data.amount) : undefined,
      origin_wallet_id: data?.wallet_id || wallets?.[0]?.id || '',
      destination_wallet_id: data?.transfer?.linked_wallet_id || '',
      destination_amount: data?.transfer?.linked_amount
        ? Math.abs(data.transfer.linked_amount)
        : undefined,
      category_id: data?.category_id || '',
      taken_at: data?.taken_at ? new Date(data.taken_at) : new Date(),
      report_opt_in: data?.report_opt_in || true,
      tag_ids: [] as string[],
      is_transfer: !!data?.transfer,
      is_amount_confidential:
        (data as Record<string, unknown>)?.is_amount_confidential === true,
      is_description_confidential:
        (data as Record<string, unknown>)?.is_description_confidential === true,
      is_category_confidential:
        (data as Record<string, unknown>)?.is_category_confidential === true,
    },
  });

  // Keep is_transfer in sync with local state
  useEffect(() => {
    form.setValue('is_transfer', isTransfer);
  }, [isTransfer, form]);

  useEffect(() => {
    if (existingTags && existingTags.length > 0) {
      const tagIds = existingTags.map((t) => t.tag_id);
      form.setValue('tag_ids', tagIds);
    }
  }, [existingTags, form]);

  useEffect(() => {
    if (data?.id || form.getValues('origin_wallet_id')) return;
    if (!wallets || wallets.length === 0) return;

    const targetWalletId =
      defaultWalletId && wallets.some((w) => w.id === defaultWalletId)
        ? defaultWalletId
        : wallets[0]?.id;

    if (targetWalletId) {
      form.setValue('origin_wallet_id', targetWalletId);
    }
  }, [defaultWalletId, data?.id, form, wallets]);

  useEffect(() => {
    if (data?.id || form.getValues('category_id')) return;
    if (!categories || categories.length === 0 || !defaultCategoryId) return;

    if (categories.some((c) => c.id === defaultCategoryId)) {
      form.setValue('category_id', defaultCategoryId);
    }
  }, [defaultCategoryId, data?.id, form, categories]);

  const hasCreatePermission = canCreateTransactions && !data?.id;
  const hasUpdatePermission = canUpdateTransactions && data?.id;
  const hasFormPermission = hasCreatePermission || hasUpdatePermission;

  const createTransferMutation = useMutation({
    mutationFn: async (payload: {
      origin_wallet_id: string;
      destination_wallet_id: string;
      amount: number;
      destination_amount?: number;
      description?: string;
      taken_at: Date;
      report_opt_in: boolean;
      tag_ids?: string[];
    }) => {
      const body = await fetcher(`/api/workspaces/${wsId}/transfers`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!body || body.message !== 'success') {
        throw new Error(
          body?.message ||
            t('transaction-data-table.error_creating_transaction')
        );
      }

      return body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [`/api/workspaces/${wsId}/transactions/infinite`],
      });
      router.refresh();
    },
  });

  const selectedWalletId = form.watch('origin_wallet_id');
  const selectedDestinationWalletId = form.watch('destination_wallet_id');
  const sourceAmount = form.watch('amount');
  const selectedWalletCurrency = useMemo(
    () => wallets?.find((w) => w.id === selectedWalletId)?.currency,
    [wallets, selectedWalletId]
  );
  const selectedDestinationWalletCurrency = useMemo(
    () => wallets?.find((w) => w.id === selectedDestinationWalletId)?.currency,
    [wallets, selectedDestinationWalletId]
  );
  const isCrossCurrencyTransfer = useMemo(
    () =>
      !!selectedWalletCurrency &&
      !!selectedDestinationWalletCurrency &&
      selectedWalletCurrency.toUpperCase() !==
        selectedDestinationWalletCurrency.toUpperCase(),
    [selectedWalletCurrency, selectedDestinationWalletCurrency]
  );
  const { data: exchangeRateData } = useExchangeRates();
  const suggestedExchangeRate = useMemo(() => {
    if (
      !isTransfer ||
      !isCrossCurrencyTransfer ||
      !selectedWalletCurrency ||
      !selectedDestinationWalletCurrency ||
      !exchangeRateData?.data
    ) {
      return null;
    }

    const convertedUnitAmount = convertCurrency(
      1,
      selectedWalletCurrency,
      selectedDestinationWalletCurrency,
      exchangeRateData.data
    );

    if (!convertedUnitAmount || !Number.isFinite(convertedUnitAmount)) {
      return null;
    }

    return convertedUnitAmount;
  }, [
    isTransfer,
    isCrossCurrencyTransfer,
    selectedWalletCurrency,
    selectedDestinationWalletCurrency,
    exchangeRateData?.data,
  ]);
  // Reset override to auto when transfer is disabled
  useEffect(() => {
    if (!isTransfer) setIsDestinationOverridden(false);
  }, [isTransfer]);

  // Reset override to auto when the wallet pair changes (only for new transfers)
  useEffect(() => {
    if (data?.id) return;
    if (!selectedWalletId && !selectedDestinationWalletId) return;

    setIsDestinationOverridden(false);
  }, [data?.id, selectedWalletId, selectedDestinationWalletId]);

  // Auto-fill destination amount from source × exchange rate (source-driven only)
  useEffect(() => {
    if (
      isDestinationOverridden ||
      !isTransfer ||
      !isCrossCurrencyTransfer ||
      !suggestedExchangeRate ||
      !Number.isFinite(suggestedExchangeRate) ||
      !sourceAmount ||
      sourceAmount <= 0
    ) {
      return;
    }

    const calculated = roundTransferAmount(
      sourceAmount * suggestedExchangeRate
    );
    if (!Number.isFinite(calculated) || calculated <= 0) return;

    form.setValue('destination_amount', calculated, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }, [
    isDestinationOverridden,
    isTransfer,
    isCrossCurrencyTransfer,
    suggestedExchangeRate,
    sourceAmount,
    form,
  ]);

  const canManageConfidential =
    (hasCreatePermission && canCreateConfidentialTransactions) ||
    (hasUpdatePermission && canUpdateConfidentialTransactions);

  async function onSubmit(formData: TransactionFormValues) {
    if (!hasFormPermission) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

    setLoading(true);

    if (isTransfer) {
      const sourceWallet = wallets?.find(
        (wallet) => wallet.id === formData.origin_wallet_id
      );
      const destinationWallet = wallets?.find(
        (wallet) => wallet.id === formData.destination_wallet_id
      );
      const sourceCurrency = sourceWallet?.currency;
      const destinationCurrency = destinationWallet?.currency;
      const destinationAmount =
        sourceCurrency &&
        destinationCurrency &&
        sourceCurrency.toUpperCase() === destinationCurrency.toUpperCase()
          ? formData.amount
          : formData.destination_amount;

      try {
        await createTransferMutation.mutateAsync({
          origin_wallet_id: formData.origin_wallet_id,
          destination_wallet_id: formData.destination_wallet_id!,
          amount: formData.amount,
          destination_amount: destinationAmount,
          description: formData.description,
          taken_at: formData.taken_at,
          report_opt_in: formData.report_opt_in,
          tag_ids: formData.tag_ids,
        });

        onFinish?.(formData);
      } catch (error) {
        setLoading(false);
        toast.error(
          error instanceof Error
            ? error.message
            : t('transaction-data-table.error_creating_transaction')
        );
      }
    } else {
      // Normal transaction mode
      const res = await fetch(
        formData?.id
          ? `/api/workspaces/${wsId}/transactions/${formData.id}`
          : `/api/workspaces/${wsId}/transactions`,
        {
          method: formData?.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            amount:
              categories?.find((c) => c.id === formData.category_id)
                ?.is_expense === false
                ? Math.abs(formData.amount)
                : -Math.abs(formData.amount),
          }),
        }
      );

      if (res.ok) {
        queryClient.invalidateQueries({
          queryKey: [`/api/workspaces/${wsId}/transactions/infinite`],
        });
        onFinish?.(formData);
        router.refresh();
      } else {
        setLoading(false);
        toast.error(t('transaction-data-table.error_creating_transaction'));
      }
    }
  }

  const [newContentType, setNewContentType] = useState<
    NewContentType | undefined
  >();
  const [newContent, setNewContent] = useState<NewContent>(undefined);
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  // Disable transfer mode when editing existing non-transfer transactions
  const canToggleTransfer = !data?.id || !!data?.transfer;

  return (
    <>
      <FormContentDialog
        wsId={wsId}
        queryClient={queryClient}
        form={form}
        newContentType={newContentType}
        setNewContentType={setNewContentType}
        newContent={newContent}
        setNewContent={setNewContent}
        newTagColor={newTagColor}
        setNewTagColor={setNewTagColor}
      />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col space-y-3"
        >
          {/* Transfer mode toggle */}
          {canToggleTransfer && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-dynamic-blue" />
                <Label htmlFor="transfer-toggle" className="text-sm">
                  {t('transaction-data-table.transfer_mode')}
                </Label>
              </div>
              <Switch
                id="transfer-toggle"
                checked={isTransfer}
                onCheckedChange={setIsTransfer}
                disabled={loading || !hasFormPermission}
              />
            </div>
          )}

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
              <FormBasicTab
                form={form}
                locale={locale}
                wallets={wallets}
                walletsLoading={walletsLoading}
                categories={categories}
                categoriesLoading={categoriesLoading}
                selectedWalletId={selectedWalletId}
                selectedWalletCurrency={selectedWalletCurrency}
                loading={loading}
                hasFormPermission={!!hasFormPermission}
                isTransfer={isTransfer}
                suggestedExchangeRate={suggestedExchangeRate}
                isDestinationOverridden={isDestinationOverridden}
                setIsDestinationOverridden={setIsDestinationOverridden}
                setNewContentType={setNewContentType}
                setNewContent={setNewContent}
              />
            </TabsContent>

            {/* Tab 2: More - Tags, Report, and Confidential settings */}
            <TabsContent value="more" className="space-y-4">
              <FormMoreTab
                form={form}
                tags={tags}
                tagsLoading={tagsLoading}
                loading={loading}
                hasFormPermission={!!hasFormPermission}
                canManageConfidential={!!canManageConfidential}
                isTransfer={isTransfer}
                setNewContentType={setNewContentType}
                setNewContent={setNewContent}
              />
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
                : isTransfer
                  ? t('workspace-finance-transactions.transfer')
                  : t('ws-transactions.create')}
          </Button>
        </form>
      </Form>
    </>
  );
}
