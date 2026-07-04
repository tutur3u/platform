import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
import { InventoryResourcePage } from '../../../../components/inventory/inventory-resource-page';
import { productSupplierColumns } from '../../../../components/inventory/product-supplier-columns';
import { ProductSupplierForm } from '../../../../components/inventory/product-supplier-form';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventorySuppliersSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventorySuppliersLoaderData = {
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canUpdateInventory: boolean;
  canViewInventory: boolean;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateInventorySuppliersSearch(
  search: Record<string, unknown>
): InventorySuppliersSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

export const Route = createFileRoute('/$locale/$wsId/inventory/suppliers')({
  component: InventorySuppliersRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Suppliers in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Suppliers',
    });
  },
  loader: async ({ params }): Promise<InventorySuppliersLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/suppliers`,
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
    ]);

    return {
      canCreateInventory,
      canDeleteInventory,
      canUpdateInventory,
      canViewInventory,
      workspaceId: workspace.workspaceId,
    };
  },
  validateSearch: validateInventorySuppliersSearch,
});

function InventorySuppliersRoutePage() {
  const data = Route.useLoaderData() as
    | InventorySuppliersLoaderData
    | undefined;
  const search = Route.useSearch() as InventorySuppliersSearch;
  const navigate = useNavigate({ from: Route.fullPath });

  if (!data) {
    throw notFound();
  }

  const updateSearch = (nextSearch: Partial<InventorySuppliersSearch>) => {
    void navigate({
      search: (current: InventorySuppliersSearch) => ({
        page: nextSearch.page ?? current.page ?? 1,
        pageSize: nextSearch.pageSize ?? current.pageSize ?? 10,
        q: nextSearch.q ?? current.q ?? '',
      }),
    });
  };

  return (
    <InventoryResourcePage<ProductSupplier, unknown>
      accessDeniedDescriptionKey="ws-roles.inventory_suppliers_access_denied_description"
      canViewInventory={data.canViewInventory}
      columnGenerator={productSupplierColumns}
      createForm={
        data.canCreateInventory ? (
          <ProductSupplierForm
            canCreateInventory={data.canCreateInventory}
            canUpdateInventory={data.canUpdateInventory}
            wsId={data.workspaceId}
          />
        ) : undefined
      }
      defaultVisibility={{
        created_at: false,
        id: false,
      }}
      extraData={{
        canDeleteInventory: data.canDeleteInventory,
        canUpdateInventory: data.canUpdateInventory,
      }}
      featureNamespace="ws-inventory-suppliers"
      namespace="basic-data-table"
      onSearchChange={updateSearch}
      resource="suppliers"
      search={search}
      wsId={data.workspaceId}
    />
  );
}
