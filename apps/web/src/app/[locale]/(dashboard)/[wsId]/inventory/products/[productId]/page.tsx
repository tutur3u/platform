import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { ProductFormPageClient } from './product-form-page-client';

export const metadata: Metadata = {
  title: 'Product Details',
  description:
    'Manage Product Details in the Products area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export default async function WorkspaceProductsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const { productId } = await params;

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
                  {t('ws-roles.inventory_products_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canViewStockQuantity = containsPermission('view_stock_quantity');
        const canUpdateStockQuantity = containsPermission(
          'update_stock_quantity'
        );

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-inventory-products.plural')}
              singularTitle={t('ws-inventory-products.singular')}
              description={t('ws-inventory-products.description')}
              createTitle={t('ws-inventory-products.create')}
              createDescription={t('ws-inventory-products.create_description')}
            />
            <Separator className="my-4" />
            <ProductFormPageClient
              wsId={wsId}
              productId={productId}
              canCreateInventory={canCreateInventory}
              canUpdateInventory={canUpdateInventory}
              canViewStockQuantity={canViewStockQuantity}
              canUpdateStockQuantity={canUpdateStockQuantity}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
