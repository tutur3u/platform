import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryCatalogProducts } from '@tuturuuu/inventory-core/product-rpc';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions || !canViewInventoryCatalog(permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    const includeStock =
      canViewInventoryStock(permissions) ||
      canCreateInventorySales(permissions);

    const { data } = await getInventoryCatalogProducts({
      includeStock,
      limit: 10_000,
      sbAdmin,
      sortBy: 'name',
      sortOrder: 'asc',
      status: 'active',
      wsId,
    });

    const products = (data ?? []).map((product) => {
      const normalizedProduct = product as typeof product & {
        inventory_products?: unknown[] | null;
        inventory_manufacturers?: { id: string; name: string | null } | null;
      };
      const { inventory_products: inventoryProducts, ...productFields } =
        normalizedProduct;

      return {
        ...productFields,
        inventory_products: includeStock ? (inventoryProducts ?? []) : [],
        manufacturer: normalizedProduct.inventory_manufacturers?.name ?? null,
      };
    });

    return NextResponse.json({ data: products });
  } catch (error) {
    serverLogger.error('Error fetching product options:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
