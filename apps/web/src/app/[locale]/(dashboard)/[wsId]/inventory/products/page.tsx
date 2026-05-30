import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { ProductsPageClient } from './products-page-client';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Manage Products in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceProductsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        if (!containsPermission('view_inventory')) {
          const t = await getTranslations();
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_products_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canDeleteInventory = containsPermission('delete_inventory');
        const canViewStockQuantity = containsPermission('view_stock_quantity');
        const canUpdateStockQuantity = containsPermission(
          'update_stock_quantity'
        );
        const t = await getTranslations();

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-products.plural')}
              singularTitle={t('ws-inventory-products.singular')}
              description={t('ws-inventory-products.description')}
              createTitle={t('ws-inventory-products.create')}
              createDescription={t('ws-inventory-products.create_description')}
              action={
                canCreateInventory ? (
                  <Link href={`/${wsId}/inventory/products/new`}>
                    <Button className="cursor-pointer">
                      <Plus className="mr-2 h-4 w-4" />
                      <span>{t('ws-inventory-products.create')}</span>
                    </Button>
                  </Link>
                ) : undefined
              }
            />
            <Separator className="my-4" />
            <ProductsPageClient
              wsId={wsId}
              canUpdateInventory={canUpdateInventory}
              canDeleteInventory={canDeleteInventory}
              canViewStockQuantity={canViewStockQuantity}
              canUpdateStockQuantity={canUpdateStockQuantity}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
