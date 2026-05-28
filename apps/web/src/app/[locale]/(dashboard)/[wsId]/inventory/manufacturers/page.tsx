import type { InventoryManufacturer } from '@tuturuuu/internal-api';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  canManageInventorySetup,
  canViewInventoryCatalog,
} from '@/lib/inventory/permissions';
import { productManufacturerColumns } from './columns';
import { ProductManufacturerForm } from './form';

export const metadata: Metadata = {
  title: 'Manufacturers',
  description:
    'Manage Manufacturers in the Inventory area of your Tuturuuu workspace.',
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

export default async function WorkspaceManufacturersPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();

        const canViewSetup =
          canViewInventoryCatalog(permissions) ||
          canManageInventorySetup(permissions);

        if (!canViewSetup) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t(
                    'ws-roles.inventory_manufacturers_access_denied_description'
                  )}
                </p>
              </div>
            </div>
          );
        }

        const canManageSetup = canManageInventorySetup(permissions);
        const canCreateInventory = canManageSetup;
        const canUpdateInventory = canManageSetup;
        const canDeleteInventory = canManageSetup;

        const { data, count } = await getData(wsId, await searchParams);

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-manufacturers.plural')}
              singularTitle={t('ws-inventory-manufacturers.singular')}
              description={t('ws-inventory-manufacturers.description')}
              createTitle={t('ws-inventory-manufacturers.create')}
              createDescription={t(
                'ws-inventory-manufacturers.create_description'
              )}
              form={
                canCreateInventory ? (
                  <ProductManufacturerForm
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
              columnGenerator={productManufacturerColumns}
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
    .from('inventory_manufacturers')
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

  const { data, error, count } = await queryBuilder.order('name');
  if (error) throw error;

  return { data, count } as { data: InventoryManufacturer[]; count: number };
}
