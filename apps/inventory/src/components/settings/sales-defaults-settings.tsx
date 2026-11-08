'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Save, Tags, Wallet } from '@tuturuuu/icons';
import {
  autoSetWriteValue,
  canEditLoadedSalesDefaults,
  loadedSalesPeriodAutoDefault,
} from '@tuturuuu/inventory-core/sales-period-default-policy';
import type {
  InventoryProductFormOptionsResponse,
  InventorySalesDefaultsPayload,
} from '@tuturuuu/internal-api/inventory';
import {
  getInventoryProductFormOptions,
  listInventorySalesPeriods,
  updateInventorySalesDefaults,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
} from '@tuturuuu/ui/custom/settings-section';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField } from '@/components/operator/operator-form-fields';

const NONE = 'none';

type Draft = {
  categoryId: string;
  periodId: string;
  walletId: string;
};

export function InventorySalesDefaultsSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.inventory.sales_defaults');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [autoDraft, setAutoDraft] = useState<boolean | null>(null);
  const options = useQuery({
    queryFn: () => getInventoryProductFormOptions(wsId),
    queryKey: ['inventory', wsId, 'form-options'],
  });
  const periods = useQuery({
    queryFn: () => listInventorySalesPeriods(wsId),
    queryKey: ['inventory', wsId, 'sales-periods'],
  });
  const initial: Draft = {
    categoryId: options.data?.defaultFinanceCategoryId || NONE,
    periodId: options.data?.defaultSalesPeriodId || NONE,
    walletId:
      options.data?.defaultRevenueWalletId ||
      options.data?.defaultWalletId ||
      NONE,
  };
  const current = draft ?? initial;
  const loadedAutoDefault = loadedSalesPeriodAutoDefault(
    options.data?.autoSetNewSalesPeriodAsDefault
  );
  const shownAutoDefault = autoDraft ?? loadedAutoDefault;
  const canEditAutoDefault = canEditLoadedSalesDefaults(
    options.data?.canEditSalesDefaults
  );
  const policyUnavailable =
    options.isError || (options.isSuccess && loadedAutoDefault === null);
  const updateDraft = (key: keyof Draft, value: string) =>
    setDraft((existing) => ({ ...(existing ?? initial), [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const policyWrite = autoSetWriteValue({
        canEdit: options.data?.canEditSalesDefaults,
        enabled: autoDraft,
      });
      const payload: InventorySalesDefaultsPayload = {
        ...(draft
          ? {
              defaultFinanceCategoryId:
                current.categoryId === NONE ? null : current.categoryId,
              defaultRevenueWalletId:
                current.walletId === NONE ? null : current.walletId,
              defaultSalesPeriodId:
                current.periodId === NONE ? null : current.periodId,
            }
          : {}),
        ...(policyWrite === undefined
          ? {}
          : { autoSetNewSalesPeriodAsDefault: policyWrite }),
      };
      return updateInventorySalesDefaults(wsId, payload);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('save_error')),
    onSuccess: () => {
      const policyWrite = autoSetWriteValue({
        canEdit: options.data?.canEditSalesDefaults,
        enabled: autoDraft,
      });
      queryClient.setQueryData<InventoryProductFormOptionsResponse>(
        ['inventory', wsId, 'form-options'],
        (existing) =>
          existing
            ? {
                ...existing,
                ...(policyWrite === undefined
                  ? {}
                  : { autoSetNewSalesPeriodAsDefault: policyWrite }),
                ...(draft
                  ? {
                      defaultFinanceCategoryId:
                        current.categoryId === NONE ? null : current.categoryId,
                      defaultRevenueWalletId:
                        current.walletId === NONE ? null : current.walletId,
                      defaultSalesPeriodId:
                        current.periodId === NONE ? null : current.periodId,
                    }
                  : {}),
              }
            : existing
      );
      setAutoDraft(null);
      setDraft(null);
      toast.success(t('save_success'));
    },
  });

  const isLoading = options.isPending || periods.isPending;

  return (
    <SettingsSection
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t('title')}
          <Badge variant="secondary">{t('badge')}</Badge>
        </span>
      }
      description={t('description')}
    >
      <DefaultField
        description={t('wallet_description')}
        icon={Wallet}
        label={t('wallet')}
      >
        <SelectField
          allowEmpty={false}
          className="[&>:first-child]:sr-only"
          disabled={isLoading}
          label={t('wallet')}
          onChange={(value) => updateDraft('walletId', value)}
          options={[
            { id: NONE, name: t('none') },
            ...(options.data?.wallets ?? []),
          ]}
          placeholder={t('wallet_placeholder')}
          searchPlaceholder={t('wallet_placeholder')}
          value={current.walletId}
        />
      </DefaultField>
      <DefaultField
        description={t('category_description')}
        icon={Tags}
        label={t('category')}
      >
        <SelectField
          allowEmpty={false}
          className="[&>:first-child]:sr-only"
          disabled={isLoading}
          label={t('category')}
          onChange={(value) => updateDraft('categoryId', value)}
          options={[
            { id: NONE, name: t('none') },
            ...(options.data?.financeCategories ?? []).flatMap((category) =>
              category.id ? [{ id: category.id, name: category.name }] : []
            ),
          ]}
          placeholder={t('category_placeholder')}
          searchPlaceholder={t('category_placeholder')}
          value={current.categoryId}
        />
      </DefaultField>
      <DefaultField
        description={t('period_description')}
        icon={CalendarDays}
        label={t('period')}
      >
        <SelectField
          allowEmpty={false}
          className="[&>:first-child]:sr-only"
          disabled={isLoading}
          label={t('period')}
          onChange={(value) => updateDraft('periodId', value)}
          options={[
            { id: NONE, name: t('none') },
            ...(periods.data?.data ?? []).filter(
              (period) => period.status === 'active'
            ),
          ]}
          placeholder={t('period_placeholder')}
          searchPlaceholder={t('period_placeholder')}
          value={current.periodId}
        />
      </DefaultField>
      <SettingItemTab
        title={t('auto_default')}
        description={
          policyUnavailable
            ? t('auto_default_unavailable')
            : t('auto_default_description')
        }
        icon={<CalendarDays className="h-4 w-4" />}
        controlWidth="lg"
      >
        <Switch
          aria-label={t('auto_default')}
          checked={shownAutoDefault === true}
          disabled={
            isLoading ||
            mutation.isPending ||
            !canEditAutoDefault ||
            shownAutoDefault === null
          }
          onCheckedChange={(checked) => setAutoDraft(checked)}
        />
      </SettingItemTab>

      <SettingsSectionBlock className="flex items-center justify-between gap-3 py-3">
        <p className="text-muted-foreground text-sm">{t('hint')}</p>
        <Button
          disabled={
            (!draft && autoDraft === null) || mutation.isPending || isLoading
          }
          onClick={() => mutation.mutate()}
          size="sm"
          type="button"
        >
          <Save className="h-4 w-4" />
          {mutation.isPending ? t('saving') : t('save')}
        </Button>
      </SettingsSectionBlock>
    </SettingsSection>
  );
}

function DefaultField({
  children,
  description,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Wallet;
  label: string;
}) {
  return (
    <SettingItemTab
      title={label}
      description={description}
      icon={<Icon className="h-4 w-4" />}
      controlWidth="lg"
    >
      {children}
    </SettingItemTab>
  );
}
