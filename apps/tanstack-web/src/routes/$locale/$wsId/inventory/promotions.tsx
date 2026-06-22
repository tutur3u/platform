import { createFileRoute, notFound } from '@tanstack/react-router';
import { PromotionsPageClient } from '../../../../components/inventory/promotions/promotions-page-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryPromotionsLoaderData = {
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canUpdateInventory: boolean;
  canViewInventory: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/inventory/promotions')({
  component: InventoryPromotionsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Promotions in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Promotions',
    });
  },
  loader: async ({ params }): Promise<InventoryPromotionsLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/promotions`,
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
});

function InventoryPromotionsRoutePage() {
  const data = Route.useLoaderData() as
    | InventoryPromotionsLoaderData
    | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <PromotionsPageClient
      canCreateInventory={data.canCreateInventory}
      canDeleteInventory={data.canDeleteInventory}
      canUpdateInventory={data.canUpdateInventory}
      canViewInventory={data.canViewInventory}
      wsId={data.workspaceId}
    />
  );
}
