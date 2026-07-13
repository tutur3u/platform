import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { INVENTORY_APP_URL } from '@/constants/common';

type StorefrontIdentity = Pick<InventoryStorefront, 'id' | 'wsId'>;

type WorkspaceActor = {
  email?: string | null;
  id: string;
};

type WorkspaceLookup = (
  wsId: string,
  options: { useAdmin: true; user: WorkspaceActor }
) => Promise<{ joined: boolean } | null>;

export function createInventoryStorefrontManageHref(
  storefront: StorefrontIdentity,
  baseUrl = INVENTORY_APP_URL
) {
  const href = new URL(
    `/${encodeURIComponent(storefront.wsId)}/storefront`,
    `${baseUrl.replace(/\/$/u, '')}/`
  );
  href.searchParams.set('storefront', storefront.id);
  return href.toString();
}

export async function resolveInventoryStorefrontManageHref({
  storefront,
  user,
  workspaceLookup = getWorkspace,
}: {
  storefront: StorefrontIdentity;
  user: WorkspaceActor;
  workspaceLookup?: WorkspaceLookup;
}) {
  try {
    const workspace = await workspaceLookup(storefront.wsId, {
      useAdmin: true,
      user,
    });

    return workspace?.joined
      ? createInventoryStorefrontManageHref(storefront)
      : null;
  } catch {
    // Storefront browsing remains available when the optional management
    // access lookup is unavailable.
    return null;
  }
}
