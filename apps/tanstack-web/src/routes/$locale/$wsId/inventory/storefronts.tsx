import { createFileRoute, notFound } from '@tanstack/react-router';
import { StorefrontsClient } from '../../../../components/inventory/storefronts/storefronts-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryStorefrontsLoaderData = {
  canViewInventory: boolean;
  workspaceId: string;
};

// Legacy `canViewInventoryCatalog` grants access when the caller holds ANY of
// these permissions (apps/web src/lib/inventory/permissions.ts).
const CATALOG_VIEW_PERMISSIONS = [
  'view_inventory_catalog',
  'manage_inventory_catalog',
  'view_inventory',
  'create_inventory',
  'update_inventory',
  'delete_inventory',
] as const;

export const Route = createFileRoute('/$locale/$wsId/inventory/storefronts')({
  component: InventoryStorefrontsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage storefront listings and product variants.',
      locale,
      title: 'Storefronts',
    });
  },
  loader: async ({ params }): Promise<InventoryStorefrontsLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/storefronts`,
    });

    // Legacy getPermissions({ wsId }) -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy canViewInventoryCatalog(permissions): any-of the catalog view
    // permissions. The legacy page renders an inline access-denied state (not
    // notFound/redirect) when this is false, so we forward the flag to the
    // client and let it gate the UI.
    const results = await Promise.all(
      CATALOG_VIEW_PERMISSIONS.map((permission) =>
        hasWorkspacePermission({
          data: {
            permission,
            wsId: workspace.workspaceId,
          },
        })
      )
    );
    const canViewInventory = results.some(Boolean);

    return {
      canViewInventory,
      workspaceId: workspace.workspaceId,
    };
  },
});

function InventoryStorefrontsRoutePage() {
  const data = Route.useLoaderData() as
    | InventoryStorefrontsLoaderData
    | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <StorefrontsClient
      canViewInventory={data.canViewInventory}
      wsId={data.workspaceId}
    />
  );
}
