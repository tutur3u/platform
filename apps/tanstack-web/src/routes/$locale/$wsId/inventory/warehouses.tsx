import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import { InventoryResourcePage } from '../../../../components/inventory/inventory-resource-page';
import { productWarehouseColumns } from '../../../../components/inventory/product-warehouse-columns';
import { ProductWarehouseForm } from '../../../../components/inventory/product-warehouse-form';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type ProductWarehouseRow = ProductWarehouse & {
  created_at?: string | null;
};

type InventoryWarehousesSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventoryWarehousesLoaderData = {
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

function validateInventoryWarehousesSearch(
  search: Record<string, unknown>
): InventoryWarehousesSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

export const Route = createFileRoute('/$locale/$wsId/inventory/warehouses')({
  component: InventoryWarehousesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Warehouses in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Warehouses',
    });
  },
  loader: async ({ params }): Promise<InventoryWarehousesLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/warehouses`,
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
  validateSearch: validateInventoryWarehousesSearch,
});

function InventoryWarehousesRoutePage() {
  const data = Route.useLoaderData() as
    | InventoryWarehousesLoaderData
    | undefined;
  const search = Route.useSearch() as InventoryWarehousesSearch;
  const navigate = useNavigate({ from: Route.fullPath });

  if (!data) {
    throw notFound();
  }

  const updateSearch = (nextSearch: Partial<InventoryWarehousesSearch>) => {
    void navigate({
      search: (current: InventoryWarehousesSearch) => ({
        page: nextSearch.page ?? current.page ?? 1,
        pageSize: nextSearch.pageSize ?? current.pageSize ?? 10,
        q: nextSearch.q ?? current.q ?? '',
      }),
    });
  };

  return (
    <InventoryResourcePage<ProductWarehouseRow, unknown>
      accessDeniedDescriptionKey="ws-roles.inventory_warehouses_access_denied_description"
      canViewInventory={data.canViewInventory}
      columnGenerator={productWarehouseColumns}
      createForm={
        data.canCreateInventory ? (
          <ProductWarehouseForm
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
      featureNamespace="ws-inventory-warehouses"
      namespace="basic-data-table"
      onSearchChange={updateSearch}
      resource="warehouses"
      search={search}
      wsId={data.workspaceId}
    />
  );
}
