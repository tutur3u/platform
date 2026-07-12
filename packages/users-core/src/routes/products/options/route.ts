import {
  canCreateInventorySales,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryCatalogProducts } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const permissions = await getUserGroupRoutePermissions(rawWsId, request);
    if (!permissions || !canViewInventoryCatalog(permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const includeStock =
      canViewInventoryStock(permissions) ||
      canCreateInventorySales(permissions);
    const admin = await createAdminClient({ noCookie: true });
    const { data } = await getInventoryCatalogProducts({
      includeStock,
      limit: 10_000,
      sbAdmin: admin,
      sortBy: 'name',
      sortOrder: 'asc',
      status: 'active',
      wsId,
    });

    return NextResponse.json({
      data: (data ?? []).map((product) => {
        const normalized = product as typeof product & {
          inventory_products?: unknown[] | null;
          inventory_manufacturers?: { name: string | null } | null;
        };
        const { inventory_products: inventoryProducts, ...fields } = normalized;
        return {
          ...fields,
          inventory_products: includeStock ? (inventoryProducts ?? []) : [],
          manufacturer: normalized.inventory_manufacturers?.name ?? null,
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching product options', { error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
