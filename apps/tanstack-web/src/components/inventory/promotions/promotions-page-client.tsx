'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Loader2, Settings } from '@tuturuuu/icons';
import { listInventoryPromotions } from '@tuturuuu/internal-api/inventory';
import { getWorkspaceReferralSettings } from '@tuturuuu/internal-api/promotions';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { PromotionForm } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useMemo } from 'react';
import { getPromotionColumns } from './columns';
import WorkspaceSettingsForm from './settings-form';

type PromotionsPageClientProps = {
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canUpdateInventory: boolean;
  canViewInventory: boolean;
  wsId: string;
};

function PromotionsAccessDenied() {
  const t = useTranslations();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="font-semibold text-lg">
          {t('ws-roles.inventory_access_denied')}
        </h2>
        <p className="text-muted-foreground">
          {t('ws-roles.inventory_promotions_access_denied_description')}
        </p>
      </div>
    </div>
  );
}

function formatPromotionRows(rows: ProductPromotion[]) {
  return rows.map(({ value, use_ratio, ...rest }) => ({
    ...rest,
    value: use_ratio
      ? `${value}%`
      : Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(Number.parseInt(value.toString(), 10)),
    use_ratio,
  }));
}

export function PromotionsPageClient({
  canCreateInventory,
  canDeleteInventory,
  canUpdateInventory,
  canViewInventory,
  wsId,
}: PromotionsPageClientProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({
      shallow: true,
    })
  );
  const [pageSize, setPageSize] = useQueryState(
    'pageSize',
    parseAsInteger.withDefault(10).withOptions({
      shallow: true,
    })
  );

  const promotionsQuery = useQuery({
    enabled: canViewInventory,
    queryKey: ['inventory-table', 'promotions', wsId, { page, pageSize, q }],
    queryFn: () =>
      listInventoryPromotions(wsId, {
        page,
        pageSize,
        q,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  const settingsQuery = useQuery({
    enabled: canViewInventory,
    queryKey: ['inventory-referral-settings', wsId],
    queryFn: () => getWorkspaceReferralSettings(wsId),
    staleTime: 30 * 1000,
  });

  const regularPromotions = useMemo(
    () =>
      (promotionsQuery.data?.data ?? [])
        .filter((promotion) => promotion.promo_type === 'REGULAR')
        .map((promotion) => ({
          id: promotion.id as string,
          name: promotion.name as string | null,
          code: promotion.code as string | null,
          value: Number(promotion.value),
          use_ratio: promotion.use_ratio as boolean,
        })),
    [promotionsQuery.data?.data]
  );
  const tableRows = useMemo(
    () => formatPromotionRows(promotionsQuery.data?.data ?? []),
    [promotionsQuery.data?.data]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setQ(query || null);
      setPage(1);
    },
    [setPage, setQ]
  );

  const handleSetParams = useCallback(
    (
      params: Parameters<
        NonNullable<DataTableProps<ProductPromotion, unknown>['setParams']>
      >[0]
    ) => {
      if (params.page !== undefined) setPage(params.page);
      if (params.pageSize !== undefined) setPageSize(Number(params.pageSize));
    },
    [setPage, setPageSize]
  );

  const handleResetParams = useCallback(() => {
    setQ(null);
    setPage(null);
    setPageSize(null);
  }, [setPage, setPageSize, setQ]);

  if (!canViewInventory) {
    return <PromotionsAccessDenied />;
  }

  const settingsRow = settingsQuery.data?.data ?? undefined;
  const showCreateSettingsTrigger = settingsQuery.isFetched && !settingsRow;

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-inventory-promotions.plural')}
        singularTitle={t('ws-inventory-promotions.singular')}
        description={t('ws-inventory-promotions.description')}
        createTitle={t('ws-inventory-promotions.create')}
        createDescription={t('ws-inventory-promotions.create_description')}
        form={
          canCreateInventory ? (
            <PromotionForm
              wsId={wsId}
              canCreateInventory={canCreateInventory}
              canUpdateInventory={canUpdateInventory}
              onFinish={() => {
                queryClient.invalidateQueries({
                  queryKey: ['inventory-table', 'promotions', wsId],
                });
              }}
            />
          ) : undefined
        }
        settingsData={settingsRow}
        settingsForm={
          <WorkspaceSettingsForm
            wsId={wsId}
            regularPromotions={regularPromotions}
          />
        }
        settingsTrigger={
          showCreateSettingsTrigger ? (
            <Button
              size="xs"
              className="w-full border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15 md:w-fit"
              title={t('ws-inventory-promotions.create_settings_tooltip')}
            >
              <Settings className="h-4 w-4" />
              {t('ws-inventory-promotions.create_settings')}
            </Button>
          ) : undefined
        }
        settingsTitle={t('common.settings')}
      />
      <Separator className="my-4" />
      {promotionsQuery.isError ? (
        <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
          {t('common.error')}
        </div>
      ) : (
        <div className="relative">
          {promotionsQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-foreground/5 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('common.loading')}...
            </div>
          ) : null}
          {!promotionsQuery.isLoading ? (
            <>
              {promotionsQuery.isFetching ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-muted-foreground text-sm">
                      {t('common.loading')}...
                    </span>
                  </div>
                </div>
              ) : null}
              <DataTable
                t={t}
                data={tableRows}
                columnGenerator={getPromotionColumns}
                namespace="promotion-data-table"
                count={promotionsQuery.data?.count ?? 0}
                extraData={{
                  canDeleteInventory,
                  canUpdateInventory,
                }}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
                defaultQuery={q}
                isFiltered={Boolean(q)}
                onRefresh={() => {
                  queryClient.invalidateQueries({
                    queryKey: ['inventory-table', 'promotions', wsId],
                  });
                }}
                onSearch={handleSearch}
                pageIndex={page - 1}
                pageSize={pageSize}
                resetParams={handleResetParams}
                setParams={handleSetParams}
              />
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
