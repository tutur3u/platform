'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from '@tuturuuu/icons';
import {
  FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useFinanceTransactionPreferences } from '@tuturuuu/ui/hooks/use-finance-transaction-preferences';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { useWorkspacePermission } from '@tuturuuu/ui/hooks/use-workspace-permission';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';
import { useWallets } from '@/hooks/use-wallets';
import { InventoryProviderMappingsSettings } from './inventory-provider-mappings-settings';

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
    <div className="space-y-8">
      <SettingsSection title={tFinance('transaction_defaults_badge')}>
        <SettingItemTab
          title={tFinance('remember_last_transaction_selection')}
          description={`${tFinance('remember_last_transaction_selection_description')}\n${tFinance('remember_last_transaction_selection_help')}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
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
        </SettingItemTab>

        <SettingItemTab title={tFinance('last_wallet_preview')}>
          <p className="text-muted-foreground text-sm">
            {rememberedWalletName ||
              tFinance('remember_last_transaction_selection_empty_wallet')}
          </p>
        </SettingItemTab>

        <SettingItemTab title={tFinance('last_category_preview')}>
          <div className="text-muted-foreground text-sm">
            {rememberedCategory ? (
              <div className="flex items-center gap-2">
                <CategoryIcon category={rememberedCategory} />
                <span>
                  {rememberedCategory.name || tCategories('unnamed_category')}
                </span>
              </div>
            ) : (
              tFinance('remember_last_transaction_selection_empty_category')
            )}
          </div>
        </SettingItemTab>
      </SettingsSection>

      <SettingsSection>
        <SettingItemTab
          title={tSettings('default_wallet')}
          description={tSettings('default_wallet_description')}
          controlWidth="xl"
        >
          <div className="flex items-center gap-2">
            <Select
              onValueChange={setSelectedWalletId}
              value={selectedWalletId}
              disabled={canChangeFinanceWallets === false}
            >
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder={tSettings('select_default_wallet')} />
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

            <Button
              type="button"
              variant="outline"
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
        </SettingItemTab>

        <SettingItemTab
          title={tSettings('default_category_title')}
          description={tSettings('default_category_description')}
          controlWidth="xl"
        >
          <div className="flex items-center gap-2">
            <Select
              onValueChange={setSelectedCategoryId}
              value={selectedCategoryId}
            >
              <SelectTrigger className="min-w-0 flex-1">
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
                    <SelectItem key={category.id} value={category.id as string}>
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

            <Button
              type="button"
              variant="outline"
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
        </SettingItemTab>

        <SettingItemTab
          title={tSettings('default_reconciliation_category_title')}
          description={tSettings('default_reconciliation_category_description')}
          controlWidth="xl"
        >
          <div className="flex items-center gap-2">
            <Select
              onValueChange={setSelectedReconciliationCategoryId}
              value={selectedReconciliationCategoryId}
            >
              <SelectTrigger className="min-w-0 flex-1">
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
                    <SelectItem key={category.id} value={category.id as string}>
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

            <Button
              type="button"
              variant="outline"
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
        </SettingItemTab>
      </SettingsSection>

      <InventoryProviderMappingsSettings workspaceId={workspaceId} />
    </div>
  );
}
