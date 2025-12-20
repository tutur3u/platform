import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { productUnitColumns } from './columns';
import { ProductUnitForm } from './form';

export const metadata: Metadata = {
  title: 'Units',
  description: 'Manage Units in the Inventory area of your Tuturuuu workspace.',
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

export default async function WorkspaceUnitsPage({
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
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_units_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = permissions.includes('create_inventory');
        const canUpdateInventory = permissions.includes('update_inventory');
        const canDeleteInventory = permissions.includes('delete_inventory');

        const { data, count } = await getData(wsId, await searchParams);

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-units.plural')}
              singularTitle={t('ws-inventory-units.singular')}
              description={t('ws-inventory-units.description')}
              createTitle={t('ws-inventory-units.create')}
              createDescription={t('ws-inventory-units.create_description')}
              form={
                canCreateInventory ? (
                  <ProductUnitForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={data}
              columnGenerator={productUnitColumns}
              namespace="basic-data-table"
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
    .from('inventory_units')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: ProductUnit[]; count: number };
}
