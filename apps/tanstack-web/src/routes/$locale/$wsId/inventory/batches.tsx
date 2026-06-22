import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { InventoryBatchesPage } from '../../../../components/inventory/inventory-batches-page';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';
import { hasWorkspacePermission } from '../../../../lib/platform/workspace-permission';

type InventoryBatchesSearch = {
  page: number;
  pageSize: number;
  q: string;
};

type InventoryBatchesLoaderData = {
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

function validateInventoryBatchesSearch(
  search: Record<string, unknown>
): InventoryBatchesSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

export const Route = createFileRoute('/$locale/$wsId/inventory/batches')({
  component: InventoryBatchesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Batches in the Inventory area of your Tuturuuu workspace.',
      locale,
      title: 'Batches',
    });
  },
  loader: async ({ params }): Promise<InventoryBatchesLoaderData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/inventory/batches`,
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
  validateSearch: validateInventoryBatchesSearch,
});

function InventoryBatchesRoutePage() {
  const data = Route.useLoaderData() as InventoryBatchesLoaderData | undefined;
  const search = Route.useSearch() as InventoryBatchesSearch;
  const navigate = useNavigate({ from: Route.fullPath });

  if (!data) {
    throw notFound();
  }

  const updateSearch = (nextSearch: Partial<InventoryBatchesSearch>) => {
    void navigate({
      search: (current: InventoryBatchesSearch) => ({
        page: nextSearch.page ?? current.page ?? 1,
        pageSize: nextSearch.pageSize ?? current.pageSize ?? 10,
        q: nextSearch.q ?? current.q ?? '',
      }),
    });
  };

  return (
    <InventoryBatchesPage
      canViewInventory={data.canViewInventory}
      onSearchChange={updateSearch}
      search={search}
      wsId={data.workspaceId}
    />
  );
}
