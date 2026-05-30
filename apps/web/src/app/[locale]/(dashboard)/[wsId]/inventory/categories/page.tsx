import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { InventoryDataTableClient } from '../_components/inventory-data-table-client';
import { productCategoryColumns } from './columns';
import { ProductCategoryForm } from './form';
export const metadata: Metadata = {
  title: 'Categories',
  description:
    'Manage Categories in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceProductCategoriesPage({
  params,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        if (!containsPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_categories_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canDeleteInventory = containsPermission('delete_inventory');

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-categories.plural')}
              singularTitle={t('ws-inventory-categories.singular')}
              description={t('ws-inventory-categories.description')}
              createTitle={t('ws-inventory-categories.create')}
              createDescription={t(
                'ws-inventory-categories.create_description'
              )}
              form={
                canCreateInventory ? (
                  <ProductCategoryForm
                    wsId={wsId}
                    canCreateInventory={canCreateInventory}
                    canUpdateInventory={canUpdateInventory}
                  />
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <InventoryDataTableClient
              resource="categories"
              wsId={wsId}
              columnGenerator={productCategoryColumns}
              namespace="transaction-category-data-table"
              extraData={{
                canUpdateInventory,
                canDeleteInventory,
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
