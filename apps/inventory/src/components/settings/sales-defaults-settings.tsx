'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ReceiptText, Save, Tags, Wallet } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
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
  const updateDraft = (key: keyof Draft, value: string) =>
    setDraft((existing) => ({ ...(existing ?? initial), [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload: InventorySalesDefaultsPayload = {
        defaultFinanceCategoryId:
          current.categoryId === NONE ? null : current.categoryId,
        defaultRevenueWalletId:
          current.walletId === NONE ? null : current.walletId,
        defaultSalesPeriodId:
          current.periodId === NONE ? null : current.periodId,
      };
      return updateInventorySalesDefaults(wsId, payload);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('save_error')),
    onSuccess: () => {
      queryClient.setQueryData<InventoryProductFormOptionsResponse>(
        ['inventory', wsId, 'form-options'],
        (existing) =>
          existing
            ? {
                ...existing,
                defaultFinanceCategoryId:
                  current.categoryId === NONE ? null : current.categoryId,
                defaultRevenueWalletId:
                  current.walletId === NONE ? null : current.walletId,
                defaultSalesPeriodId:
                  current.periodId === NONE ? null : current.periodId,
              }
            : existing
      );
      setDraft(null);
      toast.success(t('save_success'));
    },
  });

  const isLoading = options.isPending || periods.isPending;

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-background p-2">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t('title')}</p>
              <Badge variant="secondary">{t('badge')}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('description')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <DefaultField
          description={t('wallet_description')}
          icon={Wallet}
          label={t('wallet')}
        >
          <SelectField
            allowEmpty={false}
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
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
        <Button
          disabled={!draft || mutation.isPending || isLoading}
          onClick={() => mutation.mutate()}
          size="sm"
          type="button"
        >
          <Save className="h-4 w-4" />
          {mutation.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
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
    <div className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
