import { createFileRoute, notFound } from '@tanstack/react-router';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { ProductsPageClient } from '../../../../components/inventory/products/products-page-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { Link } from '../../../../lib/platform/next-link-shim';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryProductsLoaderData = {
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canUpdateInventory: boolean;
  canUpdateStockQuantity: boolean;
  canViewInventory: boolean;
  canViewStockQuantity: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/inventory/products')({
  component: InventoryProductsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Products in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Products',
    });
  },
  loader: async ({ params }): Promise<InventoryProductsLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/products`,
    });

    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    const [
      canViewInventory,
      canCreateInventory,
      canUpdateInventory,
      canDeleteInventory,
      canViewStockQuantity,
      canUpdateStockQuantity,
    ] = await Promise.all([
      hasWorkspacePermission({
        data: {
          permission: 'view_inventory',
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'create_inventory',
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'update_inventory',
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'delete_inventory',
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'view_stock_quantity',
          wsId: workspace.workspaceId,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'update_stock_quantity',
          wsId: workspace.workspaceId,
        },
      }),
    ]);

    return {
      canCreateInventory,
      canDeleteInventory,
      canUpdateInventory,
      canUpdateStockQuantity,
      canViewInventory,
      canViewStockQuantity,
      workspaceId: workspace.workspaceId,
    };
  },
});

function InventoryProductsRoutePage() {
  const data = Route.useLoaderData() as InventoryProductsLoaderData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  if (!data.canViewInventory) {
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

  return (
    <>
      <FeatureSummary
        action={
          data.canCreateInventory ? (
            <Link href={`/${data.workspaceId}/inventory/products/new`}>
              <Button className="cursor-pointer">
                <Plus className="mr-2 h-4 w-4" />
                <span>{t('ws-inventory-products.create')}</span>
              </Button>
            </Link>
          ) : undefined
        }
        createDescription={t('ws-inventory-products.create_description')}
        createTitle={t('ws-inventory-products.create')}
        description={t('ws-inventory-products.description')}
        pluralTitle={t('ws-inventory-products.plural')}
        singularTitle={t('ws-inventory-products.singular')}
      />
      <Separator className="my-4" />
      <ProductsPageClient
        canDeleteInventory={data.canDeleteInventory}
        canUpdateInventory={data.canUpdateInventory}
        canUpdateStockQuantity={data.canUpdateStockQuantity}
        canViewStockQuantity={data.canViewStockQuantity}
        wsId={data.workspaceId}
      />
    </>
  );
}
