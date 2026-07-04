import { createFileRoute, notFound } from '@tanstack/react-router';
import { InventoryDashboardPage } from '../../../../components/inventory/inventory-dashboard-page';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryDashboardLoaderData = {
  canViewInventory: boolean;
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/inventory/')({
  component: InventoryDashboardRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Inventory in your Tuturuuu workspace.',
      locale,
      title: 'Inventory',
    });
  },
  loader: async ({ params }): Promise<InventoryDashboardLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory`,
    });

    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    const canViewInventory = await hasWorkspacePermission({
      data: {
        permission: 'view_inventory',
        wsId: workspace.workspaceId,
      },
    });

    return {
      canViewInventory,
      workspaceId: workspace.workspaceId,
    };
  },
});

function InventoryDashboardRoutePage() {
  const data = Route.useLoaderData() as
    | InventoryDashboardLoaderData
    | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <InventoryDashboardPage
      canViewInventory={data.canViewInventory}
      wsId={data.workspaceId}
    />
  );
}
