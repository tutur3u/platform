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

type InventoryUnitsSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventoryUnitsLoaderData = {
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canUpdateInventory: boolean;
  canViewInventory: boolean;
  workspaceId: string;
};

const inventoryCatalogViewPermissions = [
  'view_inventory_catalog',
  'manage_inventory_catalog',
  'view_inventory',
  'create_inventory',
  'update_inventory',
  'delete_inventory',
] as const;

const inventorySetupManagePermissions = [
  'manage_inventory_setup',
  'create_inventory',
  'update_inventory',
  'delete_inventory',
] as const;

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateInventoryUnitsSearch(
  search: Record<string, unknown>
): InventoryUnitsSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

async function hasAnyWorkspacePermission({
  permissions,
  wsId,
}: {
  permissions: readonly string[];
  wsId: string;
}) {
  const results = await Promise.all(
    permissions.map((permission) =>
      hasWorkspacePermission({
        data: {
          permission,
          wsId,
        },
      })
    )
  );

  return results.some(Boolean);
}

export const Route = createFileRoute('/$locale/$wsId/inventory/units')({
  component: InventoryUnitsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Units in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Units',
    });
  },
  loader: async ({ params }): Promise<InventoryUnitsLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/units`,
    });

    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    const [canViewInventory, canManageSetup] = await Promise.all([
      hasAnyWorkspacePermission({
        permissions: inventoryCatalogViewPermissions,
        wsId: workspace.workspaceId,
      }),
      hasAnyWorkspacePermission({
        permissions: inventorySetupManagePermissions,
        wsId: workspace.workspaceId,
      }),
    ]);

    return {
      canCreateInventory: canManageSetup,
      canDeleteInventory: canManageSetup,
      canUpdateInventory: canManageSetup,
      canViewInventory,
      workspaceId: workspace.workspaceId,
    };
  },
  validateSearch: validateInventoryUnitsSearch,
});

function InventoryUnitsRoutePage() {
  const data = Route.useLoaderData() as InventoryUnitsLoaderData | undefined;
  const search = Route.useSearch() as InventoryUnitsSearch;
  const navigate = useNavigate({ from: Route.fullPath });

  if (!data) {
    throw notFound();
  }

  const updateSearch = (nextSearch: Partial<InventoryUnitsSearch>) => {
    void navigate({
      search: (current: InventoryUnitsSearch) => ({
        page: nextSearch.page ?? current.page ?? 1,
        pageSize: nextSearch.pageSize ?? current.pageSize ?? 10,
        q: nextSearch.q ?? current.q ?? '',
      }),
    });
  };

  return (
    <InventoryResourcePage<InventoryNamedResourceRow, unknown>
      accessDeniedDescriptionKey="ws-roles.inventory_units_access_denied_description"
      canViewInventory={data.canViewInventory}
      columnGenerator={inventoryNamedResourceColumns}
      createForm={
        data.canCreateInventory ? (
          <InventoryNamedResourceForm
            canCreateInventory={data.canCreateInventory}
            canUpdateInventory={data.canUpdateInventory}
            kind="units"
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
        kind: 'units',
      }}
      featureNamespace="ws-inventory-units"
      namespace="basic-data-table"
      onSearchChange={updateSearch}
      resource="units"
      search={search}
      wsId={data.workspaceId}
    />
  );
}
