import { createFileRoute, notFound } from '@tanstack/react-router';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { ProductFormPageClient } from '../../../../../components/inventory/products/product-form-page-client';
import { requireCurrentUser } from '../../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../../lib/platform/workspace-permission';

type InventoryProductLoaderData = {
  canCreateInventory: boolean;
  canUpdateInventory: boolean;
  canUpdateStockQuantity: boolean;
  canViewInventory: boolean;
  canViewStockQuantity: boolean;
  productId: string;
  workspaceId: string;
};

export const Route = createFileRoute(
  '/$locale/$wsId/inventory/products/$productId'
)({
  component: InventoryProductRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Product Details in the Products area of your Tuturuuu workspace.',
      locale,
      title: 'Product Details',
    });
  },
  loader: async ({ params }): Promise<InventoryProductLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/products/${params.productId}`,
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
      canUpdateInventory,
      canUpdateStockQuantity,
      canViewInventory,
      canViewStockQuantity,
      productId: params.productId,
      workspaceId: workspace.workspaceId,
    };
  },
});

function InventoryProductRoutePage() {
  const data = Route.useLoaderData() as InventoryProductLoaderData | undefined;
  const params = Route.useParams() as { productId: string };
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
        createDescription={t('ws-inventory-products.create_description')}
        createTitle={t('ws-inventory-products.create')}
        description={t('ws-inventory-products.description')}
        pluralTitle={t('ws-inventory-products.plural')}
        singularTitle={t('ws-inventory-products.singular')}
      />
      <Separator className="my-4" />
      <ProductFormPageClient
        canCreateInventory={data.canCreateInventory}
        canUpdateInventory={data.canUpdateInventory}
        canUpdateStockQuantity={data.canUpdateStockQuantity}
        canViewStockQuantity={data.canViewStockQuantity}
        productId={params.productId}
        wsId={data.workspaceId}
      />
    </>
  );
}
