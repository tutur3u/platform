'use client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeftRight, Paperclip, Settings2, Wallet } from '@tuturuuu/icons';
import {
  createTransaction,
  createTransfer,
  deleteWorkspaceStorageObjects,
  listTransactionCategories,
  listTransactionTagLinks,
  listTransactionTags,
  listWallets,
  listWorkspaceStorageObjects,
  updateTransaction,
  updateTransfer,
  uploadWorkspaceStorageFile,
  type WorkspaceStorageListItem,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useExchangeRates } from '@tuturuuu/ui/hooks/use-exchange-rates';
import { useFinanceTransactionPreferences } from '@tuturuuu/ui/hooks/use-finance-transaction-preferences';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { convertCurrency } from '@tuturuuu/utils/exchange-rates';
import { shouldLockFinanceWalletSelectionOnCreate } from '@tuturuuu/utils/finance';
import { joinPath } from '@tuturuuu/utils/path-helper';
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
import { invalidateTransactionMutationQueries } from './query-invalidation';
import {
  type TransactionAttachmentDraft,
  TransactionAttachmentsField,
} from './transaction-attachments-field';

const TRANSACTION_ATTACHMENT_PAGE_SIZE = 100;

export function TransactionForm({
  wsId,
  data,
  onFinish,
  canCreateTransactions,
  canUpdateTransactions,
  canCreateConfidentialTransactions,
  canUpdateConfidentialTransactions,
  canChangeFinanceWallets = true,
  canSetFinanceWalletsOnCreate = true,
}: TransactionFormProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<TransactionAttachmentDraft[]>(
    []
  );
  const [isTransfer, setIsTransfer] = useState(!!data?.transfer);
  // Start in override mode when editing an existing transfer (preserve stored amounts).
  // Start in auto mode for new transfers so the exchange rate pre-fills destination.
  const [isDestinationOverridden, setIsDestinationOverridden] = useState(
    !!data?.transfer
  );
  const [walletPrefillMeta, setWalletPrefillMeta] = useState<{
    value: string;
    sourceLabel: string;
  } | null>(null);
  const [categoryPrefillMeta, setCategoryPrefillMeta] = useState<{
    value: string;
    sourceLabel: string;
  } | null>(null);
  const router = useRouter();

  const {
    rememberLastSelections,
    isLoadingRememberLastSelections,
    lastSelections,
    isLastSelectionsInitialized,
    saveLastSelections,
  } = useFinanceTransactionPreferences(wsId);

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: [`/api/workspaces/${wsId}/transactions/categories`],
    queryFn: () => listTransactionCategories(wsId),
  });

  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: [`/api/workspaces/${wsId}/wallets`],
    queryFn: () => listWallets(wsId),
  });

  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: [`/api/workspaces/${wsId}/tags`],
    queryFn: () => listTransactionTags(wsId),
  });

  const { data: existingTags } = useQuery<Array<{ tag_id: string }>>({
    queryKey: [`/api/workspaces/${wsId}/transactions/${data?.id}/tags`],
    queryFn: () => listTransactionTagLinks(wsId, data?.id || ''),
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
      origin_wallet_id: data?.wallet_id || '',
      destination_wallet_id: data?.transfer?.linked_wallet_id || '',
      destination_amount: data?.transfer?.linked_amount
        ? Math.abs(data.transfer.linked_amount)
        : undefined,
      category_id: data?.category_id || '',
      taken_at: data?.taken_at ? new Date(data.taken_at) : new Date(),
      report_opt_in: data?.report_opt_in ?? true,
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
    if (form.getValues('is_transfer') !== isTransfer) {
      form.setValue('is_transfer', isTransfer);
    }
  }, [isTransfer, form]);

  useEffect(() => {
    const tagIds = (existingTags || []).map((t) => t.tag_id);
    const currentTagIds = form.getValues('tag_ids') || [];
    const hasSameTagIds =
      currentTagIds.length === tagIds.length &&
      currentTagIds.every((id, index) => id === tagIds[index]);

    if (!hasSameTagIds) {
      form.setValue('tag_ids', tagIds);
    }
  }, [existingTags, form]);

  useEffect(() => {
    const originWalletState = form.getFieldState('origin_wallet_id');
    const isUserEdited =
      originWalletState.isDirty || originWalletState.isTouched;
    const currentWalletId = form.getValues('origin_wallet_id');
    const contextualWalletId = data?.wallet_id || '';

    if (data?.id || isUserEdited) return;
    if (!wallets || wallets.length === 0) return;
    if (isLoadingRememberLastSelections) return;
    if (rememberLastSelections && !isLastSelectionsInitialized) return;

    const rememberedWalletId =
      rememberLastSelections &&
      lastSelections.walletId &&
      wallets.some((wallet) => wallet.id === lastSelections.walletId)
        ? lastSelections.walletId
        : '';
    const nextWalletSelection =
      rememberedWalletId ||
      (contextualWalletId &&
      wallets.some((wallet) => wallet.id === contextualWalletId)
        ? contextualWalletId
        : '') ||
      (defaultWalletId &&
      wallets.some((wallet) => wallet.id === defaultWalletId)
        ? defaultWalletId
        : '') ||
      wallets[0]?.id ||
      '';
    const sourceLabel = rememberedWalletId
      ? t('transaction-data-table.prefill_source_last_used')
      : contextualWalletId && nextWalletSelection === contextualWalletId
        ? t('transaction-data-table.prefill_source_current_context')
        : defaultWalletId && nextWalletSelection === defaultWalletId
          ? t('transaction-data-table.prefill_source_workspace_default')
          : '';

    if (!nextWalletSelection) return;

    if (nextWalletSelection !== currentWalletId) {
      form.setValue('origin_wallet_id', nextWalletSelection);
    }

    setWalletPrefillMeta(
      sourceLabel
        ? {
            value: nextWalletSelection,
            sourceLabel,
          }
        : null
    );
  }, [
    data?.id,
    data?.wallet_id,
    defaultWalletId,
    form,
    isLastSelectionsInitialized,
    isLoadingRememberLastSelections,
    lastSelections.walletId,
    rememberLastSelections,
    t,
    wallets,
  ]);

  useEffect(() => {
    const categoryState = form.getFieldState('category_id');
    const isUserEdited = categoryState.isDirty || categoryState.isTouched;
    const currentCategoryId = form.getValues('category_id');
    const contextualCategoryId = data?.category_id || '';

    if (data?.id || isUserEdited) return;
    if (!categories || categories.length === 0) return;
    if (isLoadingRememberLastSelections) return;
    if (rememberLastSelections && !isLastSelectionsInitialized) return;

    const rememberedCategoryId =
      rememberLastSelections &&
      lastSelections.categoryId &&
      categories.some((category) => category.id === lastSelections.categoryId)
        ? lastSelections.categoryId
        : '';
    const nextCategorySelection =
      rememberedCategoryId ||
      (contextualCategoryId &&
      categories.some((category) => category.id === contextualCategoryId)
        ? contextualCategoryId
        : '') ||
      (defaultCategoryId &&
      categories.some((category) => category.id === defaultCategoryId)
        ? defaultCategoryId
        : '');
    const sourceLabel = rememberedCategoryId
      ? t('transaction-data-table.prefill_source_last_used')
      : contextualCategoryId && nextCategorySelection === contextualCategoryId
        ? t('transaction-data-table.prefill_source_current_context')
        : defaultCategoryId && nextCategorySelection === defaultCategoryId
          ? t('transaction-data-table.prefill_source_workspace_default')
          : '';

    if (!nextCategorySelection) return;

    if (nextCategorySelection !== currentCategoryId) {
      form.setValue('category_id', nextCategorySelection);
    }

    setCategoryPrefillMeta(
      sourceLabel
        ? {
            value: nextCategorySelection,
            sourceLabel,
          }
        : null
    );
  }, [
    categories,
    data?.category_id,
    data?.id,
    defaultCategoryId,
    form,
    isLastSelectionsInitialized,
    isLoadingRememberLastSelections,
    lastSelections.categoryId,
    rememberLastSelections,
    t,
  ]);

  const hasCreatePermission = canCreateTransactions && !data?.id;
  const hasUpdatePermission = canUpdateTransactions && data?.id;
  const hasFormPermission = hasCreatePermission || hasUpdatePermission;
  const isCreateMode = !data?.id;
  const isEditMode = !!data?.id;
  const shouldLockCreateOriginWallet =
    isCreateMode &&
    !isTransfer &&
    shouldLockFinanceWalletSelectionOnCreate({
      defaultWalletId,
      canChangeFinanceWallets,
      canSetFinanceWalletsOnCreate,
    });
  const shouldLockEditOriginWallet =
    isEditMode && !canChangeFinanceWallets && !!data?.wallet_id;
  const shouldLockEditDestinationWallet =
    isEditMode &&
    !canChangeFinanceWallets &&
    !!data?.transfer?.linked_wallet_id;

  const refreshTransactions = async () => {
    await invalidateTransactionMutationQueries(queryClient, wsId);

    if (!onFinish) {
      router.refresh();
    }
  };

  const updateAttachmentStatus = (
    attachmentId: string,
    status: TransactionAttachmentDraft['status']
  ) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, status } : attachment
      )
    );
  };

  const updateAttachmentProgress = (attachmentId: string, progress: number) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, progress }
          : attachment
      )
    );
  };

  const attachmentQuery = useInfiniteQuery({
    queryKey: [
      'finance-transaction-attachments',
      wsId,
      data?.id,
      data?.transfer?.linked_transaction_id,
      TRANSACTION_ATTACHMENT_PAGE_SIZE,
    ],
    queryFn: async ({ pageParam }) => {
      if (!data?.id) {
        return {
          data: [],
          pagination: {
            limit: TRANSACTION_ATTACHMENT_PAGE_SIZE,
            offset: pageParam,
            total: 0,
          },
        };
      }

      return listWorkspaceStorageObjects(
        wsId,
        {
          limit: TRANSACTION_ATTACHMENT_PAGE_SIZE,
          offset: pageParam,
          path: joinPath('finance', 'transactions', data.id),
          sortBy: 'created_at',
          sortOrder: 'desc',
        },
        { fetch }
      );
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.limit;

      return nextOffset < lastPage.pagination.total ? nextOffset : undefined;
    },
    enabled: !!data?.id,
  });

  const removeExistingAttachmentMutation = useMutation({
    mutationFn: async (attachment: WorkspaceStorageListItem) => {
      if (!data?.id) {
        throw new Error('Missing transaction ID');
      }

      await deleteWorkspaceStorageObjects(
        wsId,
        [joinPath('finance', 'transactions', data.id, attachment.name)],
        { fetch }
      );

      return attachment;
    },
    onSuccess: async () => {
      await attachmentQuery.refetch();
      toast.success(t('transaction-data-table.attachment_delete_success'));
    },
    onError: () => {
      toast.error(t('transaction-data-table.attachment_delete_failed'));
    },
  });

  const existingAttachments =
    attachmentQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const existingAttachmentsTotal =
    attachmentQuery.data?.pages.at(-1)?.pagination.total ??
    existingAttachments.length;

  const uploadPendingAttachments = async (transactionId?: string) => {
    const pendingAttachments = attachments.filter(
      (attachment) => attachment.status !== 'uploaded'
    );

    if (!transactionId || pendingAttachments.length === 0) {
      return;
    }

    const results = await Promise.all(
      pendingAttachments.map(async (attachment) => {
        updateAttachmentStatus(attachment.id, 'uploading');
        updateAttachmentProgress(attachment.id, 0);

        try {
          const result = await uploadWorkspaceStorageFile(
            wsId,
            attachment.file,
            {
              onUploadProgress: (progress) => {
                updateAttachmentProgress(attachment.id, progress.percent);
              },
              path: joinPath('finance', 'transactions', transactionId),
            },
            { fetch }
          );

          if (!result.finalize?.success) {
            throw new Error(
              result.finalize?.error ||
                t('transaction-data-table.attachment_upload_failed')
            );
          }

          updateAttachmentProgress(attachment.id, 100);
          updateAttachmentStatus(attachment.id, 'uploaded');
          return { ok: true };
        } catch {
          updateAttachmentStatus(attachment.id, 'error');
          return { ok: false };
        }
      })
    );

    const failedCount = results.filter((result) => !result.ok).length;
    if (transactionId === data?.id) {
      await attachmentQuery.refetch();
      setAttachments((current) =>
        current.filter((attachment) => attachment.status !== 'uploaded')
      );
    }

    if (failedCount > 0) {
      toast.error(t('transaction-data-table.attachment_upload_failed'));
      return;
    }

    toast.success(
      t('transaction-data-table.attachment_upload_success', {
        count: pendingAttachments.length,
      })
    );
  };

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
      const body = await createTransfer(wsId, payload);

      if (body?.message !== 'success') {
        throw new Error(
          body?.message ||
            t('transaction-data-table.error_creating_transaction')
        );
      }

      return body as {
        message: string;
        from_transaction_id?: string;
        to_transaction_id?: string;
      };
    },
  });

  const updateTransferMutation = useMutation({
    mutationFn: async (payload: {
      origin_transaction_id: string;
      destination_transaction_id: string;
      origin_wallet_id: string;
      destination_wallet_id: string;
      amount: number;
      destination_amount?: number;
      description?: string;
      taken_at: Date;
      report_opt_in: boolean;
      tag_ids?: string[];
    }) => {
      const body = await updateTransfer(wsId, payload);

      if (body?.message !== 'success') {
        throw new Error(
          body?.message ||
            t('transaction-data-table.error_creating_transaction')
        );
      }

      return body as { message: string };
    },
  });

  const createOrUpdateTransactionMutation = useMutation({
    mutationFn: async (payload: {
      id?: string;
      description?: string;
      amount: number;
      origin_wallet_id: string;
      category_id?: string;
      taken_at: Date;
      report_opt_in: boolean;
      tag_ids?: string[];
      is_amount_confidential?: boolean;
      is_description_confidential?: boolean;
      is_category_confidential?: boolean;
    }) => {
      const { id, ...transactionPayload } = payload;
      const body = id
        ? await updateTransaction(wsId, id, transactionPayload)
        : await createTransaction(wsId, transactionPayload);

      if (body?.message !== 'success') {
        throw new Error(
          body?.message ||
            t('transaction-data-table.error_creating_transaction')
        );
      }

      return body as { message: string; transaction_id?: string };
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

    try {
      let attachmentTransactionId: string | undefined;

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

        if (data?.id && data.transfer?.linked_transaction_id) {
          const originTransactionId = data.transfer.is_origin
            ? data.id
            : data.transfer.linked_transaction_id;
          const destinationTransactionId = data.transfer.is_origin
            ? data.transfer.linked_transaction_id
            : data.id;

          await updateTransferMutation.mutateAsync({
            origin_transaction_id: originTransactionId,
            destination_transaction_id: destinationTransactionId,
            origin_wallet_id: formData.origin_wallet_id,
            destination_wallet_id: formData.destination_wallet_id!,
            amount: formData.amount,
            destination_amount: destinationAmount,
            description: formData.description,
            taken_at: formData.taken_at,
            report_opt_in: formData.report_opt_in,
            tag_ids: formData.tag_ids,
          });
          attachmentTransactionId = data.id;
        } else {
          // New transfer mode
          const result = await createTransferMutation.mutateAsync({
            origin_wallet_id: formData.origin_wallet_id,
            destination_wallet_id: formData.destination_wallet_id!,
            amount: formData.amount,
            destination_amount: destinationAmount,
            description: formData.description,
            taken_at: formData.taken_at,
            report_opt_in: formData.report_opt_in,
            tag_ids: formData.tag_ids,
          });
          attachmentTransactionId = result.from_transaction_id;
        }
      } else {
        // Normal transaction mode
        const result = await createOrUpdateTransactionMutation.mutateAsync({
          id: formData.id,
          description: formData.description,
          amount:
            categories?.find((c) => c.id === formData.category_id)
              ?.is_expense === false
              ? Math.abs(formData.amount)
              : -Math.abs(formData.amount),
          origin_wallet_id: formData.origin_wallet_id,
          category_id: formData.category_id,
          taken_at: formData.taken_at,
          report_opt_in: formData.report_opt_in,
          tag_ids: formData.tag_ids,
          is_amount_confidential: formData.is_amount_confidential,
          is_description_confidential: formData.is_description_confidential,
          is_category_confidential: formData.is_category_confidential,
        });
        attachmentTransactionId = formData.id ?? result.transaction_id;
      }

      await uploadPendingAttachments(attachmentTransactionId);
      await refreshTransactions();

      if (!data?.id && rememberLastSelections) {
        saveLastSelections({
          walletId: formData.origin_wallet_id,
          categoryId: isTransfer
            ? lastSelections.categoryId
            : formData.category_id || undefined,
        });
      }

      onFinish?.(formData);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('transaction-data-table.error_creating_transaction')
      );
    } finally {
      setLoading(false);
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
            <TabsList className="mb-3 grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="gap-1.5">
                <Wallet className="h-4 w-4" />
                {t('transaction-data-table.tab_basic')}
              </TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5">
                <Paperclip className="h-4 w-4" />
                {t('transaction-data-table.tab_attachments')}
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
                originWalletDisabled={
                  shouldLockCreateOriginWallet || shouldLockEditOriginWallet
                }
                destinationWalletDisabled={shouldLockEditDestinationWallet}
                isTransfer={isTransfer}
                suggestedExchangeRate={suggestedExchangeRate}
                isDestinationOverridden={isDestinationOverridden}
                setIsDestinationOverridden={setIsDestinationOverridden}
                setNewContentType={setNewContentType}
                setNewContent={setNewContent}
                walletPrefillMeta={walletPrefillMeta}
                categoryPrefillMeta={categoryPrefillMeta}
              />
            </TabsContent>

            <TabsContent value="attachments" className="space-y-4">
              <TransactionAttachmentsField
                attachments={attachments}
                disabled={loading || !hasFormPermission}
                existingAttachments={existingAttachments}
                existingAttachmentsError={attachmentQuery.isError}
                existingAttachmentsHasMore={attachmentQuery.hasNextPage}
                existingAttachmentsLoading={attachmentQuery.isLoading}
                existingAttachmentsLoadingMore={
                  attachmentQuery.isFetchingNextPage
                }
                existingAttachmentsRefreshing={
                  attachmentQuery.isFetching &&
                  !attachmentQuery.isFetchingNextPage
                }
                existingAttachmentsTotal={existingAttachmentsTotal}
                onLoadMoreExisting={() => void attachmentQuery.fetchNextPage()}
                onChange={setAttachments}
                onRefreshExisting={() => void attachmentQuery.refetch()}
                onRemoveExistingAttachment={async (attachment) => {
                  await removeExistingAttachmentMutation.mutateAsync(
                    attachment
                  );
                }}
                removingExistingAttachmentName={
                  removeExistingAttachmentMutation.isPending
                    ? (removeExistingAttachmentMutation.variables?.name ?? null)
                    : null
                }
                transactionId={data?.id}
                wsId={wsId}
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
