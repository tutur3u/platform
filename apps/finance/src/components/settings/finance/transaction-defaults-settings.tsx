'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckSquare,
  LayoutGrid,
  Loader2,
  Wallet,
} from '@tuturuuu/icons';
import {
  FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { useFinanceTransactionPreferences } from '@tuturuuu/ui/hooks/use-finance-transaction-preferences';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { useWorkspacePermission } from '@tuturuuu/ui/hooks/use-workspace-permission';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';
import { useWallets } from '@/hooks/use-wallets';

interface Props {
  workspaceId: string;
  user: WorkspaceUser | null;
}

const NONE_OPTION = 'none';

function CategoryIcon({ category }: { category: TransactionCategory }) {
  if (category.icon) {
    const IconComponent = getIconComponentByKey(
      category.icon as PlatformIconKey
    );
    if (IconComponent) {
      return <IconComponent className="h-4 w-4" />;
    }
  }

  if (category.is_expense === false) {
    return <ArrowUpCircle className="h-4 w-4" />;
  }

  return <ArrowDownCircle className="h-4 w-4" />;
}

export default function TransactionDefaultsSettings({
  workspaceId,
  user,
}: Props) {
  const tFinance = useTranslations('settings.finance');
  const tSettings = useTranslations('ws-finance-settings');
  const tWallets = useTranslations('ws-wallets');
  const tCategories = useTranslations('ws-transaction-categories');

  const queryClient = useQueryClient();

  const { data: wallets = [], isLoading: isLoadingWallets } =
    useWallets(workspaceId);
  const { data: categories = [], isLoading: isLoadingCategories } =
    useTransactionCategories(workspaceId);

  const { data: defaultWalletId, isLoading: isLoadingDefaultWalletConfig } =
    useWorkspaceConfig(workspaceId, 'default_wallet_id', '');
  const { data: defaultCategoryId, isLoading: isLoadingDefaultCategoryConfig } =
    useWorkspaceConfig(workspaceId, 'default_category_id', '');
  const {
    data: defaultReconciliationCategoryId,
    isLoading: isLoadingDefaultReconciliationCategoryConfig,
  } = useWorkspaceConfig(
    workspaceId,
    FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
    ''
  );
  const { hasPermission: canChangeFinanceWallets } = useWorkspacePermission({
    wsId: workspaceId,
    permission: 'change_finance_wallets',
    user: user as WorkspaceUser,
    enabled: !!workspaceId && !!user,
  });

  const {
    rememberLastSelections,
    setRememberLastSelections,
    isLoadingRememberLastSelections,
    isPendingRememberLastSelections,
    lastSelections,
    isLastSelectionsInitialized,
  } = useFinanceTransactionPreferences(workspaceId);

  const isLoading =
    isLoadingWallets ||
    isLoadingCategories ||
    isLoadingDefaultWalletConfig ||
    isLoadingDefaultCategoryConfig ||
    isLoadingDefaultReconciliationCategoryConfig ||
    isLoadingRememberLastSelections ||
    !isLastSelectionsInitialized;

  const [selectedWalletId, setSelectedWalletId] = useState(NONE_OPTION);
  const [initialWalletId, setInitialWalletId] = useState(NONE_OPTION);
  const [selectedCategoryId, setSelectedCategoryId] = useState(NONE_OPTION);
  const [initialCategoryId, setInitialCategoryId] = useState(NONE_OPTION);
  const [
    selectedReconciliationCategoryId,
    setSelectedReconciliationCategoryId,
  ] = useState(NONE_OPTION);
  const [initialReconciliationCategoryId, setInitialReconciliationCategoryId] =
    useState(NONE_OPTION);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const nextWalletId =
      defaultWalletId && wallets.some((wallet) => wallet.id === defaultWalletId)
        ? defaultWalletId
        : NONE_OPTION;
    const nextCategoryId =
      defaultCategoryId &&
      categories.some((category) => category.id === defaultCategoryId)
        ? defaultCategoryId
        : NONE_OPTION;
    const nextReconciliationCategoryId =
      defaultReconciliationCategoryId &&
      categories.some(
        (category) => category.id === defaultReconciliationCategoryId
      )
        ? defaultReconciliationCategoryId
        : NONE_OPTION;

    setInitialWalletId(nextWalletId);
    setInitialCategoryId(nextCategoryId);
    setInitialReconciliationCategoryId(nextReconciliationCategoryId);

    if (!initialized) {
      setSelectedWalletId(nextWalletId);
      setSelectedCategoryId(nextCategoryId);
      setSelectedReconciliationCategoryId(nextReconciliationCategoryId);
      setInitialized(true);
    }
  }, [
    categories,
    defaultCategoryId,
    defaultReconciliationCategoryId,
    defaultWalletId,
    initialized,
    isLoading,
    wallets,
  ]);

  const updateWalletMutation = useMutation({
    mutationFn: async () => {
      const nextValue =
        selectedWalletId !== NONE_OPTION ? selectedWalletId : '';
      return updateWorkspaceConfig(workspaceId, 'default_wallet_id', nextValue);
    },
    onSuccess: () => {
      setInitialWalletId(selectedWalletId);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'default_wallet_id'],
      });
      toast.success(tSettings('update_success'));
    },
    onError: () => {
      toast.error(tSettings('update_error'));
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async () => {
      const nextValue =
        selectedCategoryId !== NONE_OPTION ? selectedCategoryId : '';
      return updateWorkspaceConfig(
        workspaceId,
        'default_category_id',
        nextValue
      );
    },
    onSuccess: () => {
      setInitialCategoryId(selectedCategoryId);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, 'default_category_id'],
      });
      toast.success(tSettings('update_success'));
    },
    onError: () => {
      toast.error(tSettings('update_error'));
    },
  });

  const updateReconciliationCategoryMutation = useMutation({
    mutationFn: async () => {
      const nextValue =
        selectedReconciliationCategoryId !== NONE_OPTION
          ? selectedReconciliationCategoryId
          : '';
      return updateWorkspaceConfig(
        workspaceId,
        FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
        nextValue
      );
    },
    onSuccess: () => {
      setInitialReconciliationCategoryId(selectedReconciliationCategoryId);
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          workspaceId,
          FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
        ],
      });
      toast.success(tSettings('update_success'));
    },
    onError: () => {
      toast.error(tSettings('update_error'));
    },
  });

  const rememberedWalletName = useMemo(
    () =>
      wallets.find((wallet) => wallet.id === lastSelections.walletId)?.name ||
      '',
    [lastSelections.walletId, wallets]
  );
  const rememberedCategory = useMemo(
    () =>
      categories.find(
        (category) => category.id === lastSelections.categoryId
      ) || null,
    [categories, lastSelections.categoryId]
  );

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-dynamic-blue/10 via-background to-dynamic-green/10 p-6">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-blue/60 to-transparent" />
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {tFinance('transaction_defaults_badge')}
              </Badge>
            </div>
            <h3 className="font-semibold text-xl">
              {tFinance('transaction_defaults')}
            </h3>
            <p className="max-w-2xl text-muted-foreground text-sm">
              {tFinance('transaction_defaults_description')}
            </p>
          </div>

          <div className="rounded-2xl border bg-background/80 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <CheckSquare className="h-4 w-4 text-dynamic-blue" />
                  {tFinance('remember_last_transaction_selection')}
                </div>
                <p className="max-w-xl text-muted-foreground text-sm">
                  {tFinance('remember_last_transaction_selection_description')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {tFinance('remember_last_transaction_selection_help')}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="font-medium text-sm">
                  {rememberLastSelections
                    ? tFinance('remember_last_transaction_selection_on')
                    : tFinance('remember_last_transaction_selection_off')}
                </span>
                <Switch
                  checked={rememberLastSelections}
                  disabled={isPendingRememberLastSelections}
                  onCheckedChange={setRememberLastSelections}
                />
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <Wallet className="h-4 w-4 text-dynamic-blue" />
                  {tFinance('last_wallet_preview')}
                </div>
                <p className="text-sm">
                  {rememberedWalletName ||
                    tFinance(
                      'remember_last_transaction_selection_empty_wallet'
                    )}
                </p>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                  <LayoutGrid className="h-4 w-4 text-dynamic-green" />
                  {tFinance('last_category_preview')}
                </div>
                <div className="text-sm">
                  {rememberedCategory ? (
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={rememberedCategory} />
                      <span>
                        {rememberedCategory.name ||
                          tCategories('unnamed_category')}
                      </span>
                    </div>
                  ) : (
                    tFinance(
                      'remember_last_transaction_selection_empty_category'
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-dynamic-blue" />
              <h4 className="font-semibold text-base">
                {tSettings('default_wallet')}
              </h4>
            </div>
            <p className="text-muted-foreground text-sm">
              {tSettings('default_wallet_description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{tSettings('default_wallet_label')}</Label>
              <Select
                onValueChange={setSelectedWalletId}
                value={selectedWalletId}
                disabled={canChangeFinanceWallets === false}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue
                    placeholder={tSettings('select_default_wallet')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_OPTION}>
                    {tSettings('no_default_wallet')}
                  </SelectItem>
                  {wallets
                    .filter((wallet) => wallet.id)
                    .map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id as string}>
                        {wallet.name || tWallets('unnamed_wallet')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              className="w-full rounded-xl"
              disabled={
                isLoading ||
                canChangeFinanceWallets === false ||
                updateWalletMutation.isPending ||
                selectedWalletId === initialWalletId
              }
              onClick={() => updateWalletMutation.mutate()}
            >
              {updateWalletMutation.isPending
                ? tSettings('saving')
                : tSettings('save')}
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-dynamic-green" />
              <h4 className="font-semibold text-base">
                {tSettings('default_category_title')}
              </h4>
            </div>
            <p className="text-muted-foreground text-sm">
              {tSettings('default_category_description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{tSettings('default_category_label')}</Label>
              <Select
                onValueChange={setSelectedCategoryId}
                value={selectedCategoryId}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue
                    placeholder={tSettings('select_default_category')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_OPTION}>
                    {tSettings('no_default_category')}
                  </SelectItem>
                  {categories
                    .filter((category) => category.id)
                    .map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id as string}
                      >
                        <div className="flex items-center gap-2">
                          <CategoryIcon category={category} />
                          <span>
                            {category.name || tCategories('unnamed_category')}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              className="w-full rounded-xl"
              disabled={
                isLoading ||
                updateCategoryMutation.isPending ||
                selectedCategoryId === initialCategoryId
              }
              onClick={() => updateCategoryMutation.mutate()}
            >
              {updateCategoryMutation.isPending
                ? tSettings('saving')
                : tSettings('save')}
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-dynamic-green" />
              <h4 className="font-semibold text-base">
                {tSettings('default_reconciliation_category_title')}
              </h4>
            </div>
            <p className="text-muted-foreground text-sm">
              {tSettings('default_reconciliation_category_description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>
                {tSettings('default_reconciliation_category_label')}
              </Label>
              <Select
                onValueChange={setSelectedReconciliationCategoryId}
                value={selectedReconciliationCategoryId}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue
                    placeholder={tSettings(
                      'select_default_reconciliation_category'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_OPTION}>
                    {tSettings('no_default_reconciliation_category')}
                  </SelectItem>
                  {categories
                    .filter((category) => category.id)
                    .map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id as string}
                      >
                        <div className="flex items-center gap-2">
                          <CategoryIcon category={category} />
                          <span>
                            {category.name || tCategories('unnamed_category')}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              className="w-full rounded-xl"
              disabled={
                isLoading ||
                updateReconciliationCategoryMutation.isPending ||
                selectedReconciliationCategoryId ===
                  initialReconciliationCategoryId
              }
              onClick={() => updateReconciliationCategoryMutation.mutate()}
            >
              {updateReconciliationCategoryMutation.isPending
                ? tSettings('saving')
                : tSettings('save')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
