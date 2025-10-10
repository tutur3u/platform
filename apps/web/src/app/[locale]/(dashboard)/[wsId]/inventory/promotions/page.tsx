import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import {
  getPermissions,
  getWorkspaceUser,
} from '@tuturuuu/utils/workspace-helper';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Settings } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getPromotionColumns } from './columns';
import { PromotionForm } from './form';
import WorkspaceSettingsForm from './settings-form';

export const metadata: Metadata = {
  title: 'Promotions',
  description:
    'Manage Promotions in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspacePromotionsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const { permissions } = await getPermissions({
          wsId,
        });

        if (!permissions.includes('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_promotions_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = permissions.includes('create_inventory');
        const canUpdateInventory = permissions.includes('update_inventory');
        const canDeleteInventory = permissions.includes('delete_inventory');

        const { data, count } = await getData(wsId, await searchParams);

        const user = await getCurrentUser(true);
        const wsUser = await getWorkspaceUser(wsId, user?.id!);

        const promotions = data.map(({ value, use_ratio, ...rest }) => ({
          ...rest,
          value: use_ratio
            ? `${value}%`
            : Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(parseInt(value.toString())),
          use_ratio,
        }));

        const settingsRow = await getWorkspaceSettings(wsId);

        // Derive regular promotions from the already-fetched data
        const regularPromotions = data
          .filter((p) => p.promo_type === 'REGULAR')
          .map((p) => ({
            id: p.id as string,
            name: p.name as string | null,
            code: p.code as string | null,
            value: p.value as number,
            use_ratio: p.use_ratio as boolean,
          }));

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-promotions.plural')}
              singularTitle={t('ws-inventory-promotions.singular')}
              description={t('ws-inventory-promotions.description')}
              createTitle={t('ws-inventory-promotions.create')}
              createDescription={t(
                'ws-inventory-promotions.create_description'
              )}
              form={
                canCreateInventory ? (
                  <PromotionForm
                    wsId={wsId}
                    wsUserId={wsUser.virtual_user_id}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
              settingsData={settingsRow ? settingsRow : undefined}
              settingsForm={
                <WorkspaceSettingsForm
                  wsId={wsId}
                  regularPromotions={regularPromotions}
                />
              }
              settingsTrigger={
                !settingsRow ? (
                  <Button
                    size="xs"
                    className="w-full md:w-fit border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15"
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
            <CustomDataTable
              data={promotions}
              columnGenerator={getPromotionColumns}
              namespace="promotion-data-table"
              count={count}
              extraData={{
                canDeleteInventory,
                canUpdateInventory,
              }}
              defaultVisibility={{
                id: false,
                created_at: false,
              }}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_promotions')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .neq('promo_type', 'REFERRAL');

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: ProductPromotion[]; count: number };
}

async function getWorkspaceSettings(wsId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
