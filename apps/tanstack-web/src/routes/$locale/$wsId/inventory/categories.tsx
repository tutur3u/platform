import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { inventoryNamedResourceColumns } from '../../../../components/inventory/inventory-named-resource-columns';
import {
  InventoryNamedResourceForm,
  type InventoryNamedResourceRow,
} from '../../../../components/inventory/inventory-named-resource-form';
import { InventoryResourcePage } from '../../../../components/inventory/inventory-resource-page';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryCategoriesSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventoryCategoriesLoaderData = {
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

function validateInventoryCategoriesSearch(
  search: Record<string, unknown>
): InventoryCategoriesSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

export const Route = createFileRoute('/$locale/$wsId/inventory/categories')({
  component: InventoryCategoriesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Categories in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Categories',
    });
  },
  loader: async ({ params }): Promise<InventoryCategoriesLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/categories`,
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
  validateSearch: validateInventoryCategoriesSearch,
});

function InventoryCategoriesRoutePage() {
  const data = Route.useLoaderData() as
    | InventoryCategoriesLoaderData
    | undefined;
  const search = Route.useSearch() as InventoryCategoriesSearch;
  const navigate = useNavigate({ from: Route.fullPath });

  if (!data) {
    throw notFound();
  }

  const updateSearch = (nextSearch: Partial<InventoryCategoriesSearch>) => {
    void navigate({
      search: (current: InventoryCategoriesSearch) => ({
        page: nextSearch.page ?? current.page ?? 1,
        pageSize: nextSearch.pageSize ?? current.pageSize ?? 10,
        q: nextSearch.q ?? current.q ?? '',
      }),
    });
  };

  return (
    <InventoryResourcePage<InventoryNamedResourceRow, unknown>
      accessDeniedDescriptionKey="ws-roles.inventory_categories_access_denied_description"
      canViewInventory={data.canViewInventory}
      columnGenerator={inventoryNamedResourceColumns}
      createForm={
        data.canCreateInventory ? (
          <InventoryNamedResourceForm
            canCreateInventory={data.canCreateInventory}
            canUpdateInventory={data.canUpdateInventory}
            kind="categories"
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
        kind: 'categories',
      }}
      featureNamespace="ws-inventory-categories"
      namespace="transaction-category-data-table"
      onSearchChange={updateSearch}
      resource="categories"
      search={search}
      wsId={data.workspaceId}
    />
  );
}
