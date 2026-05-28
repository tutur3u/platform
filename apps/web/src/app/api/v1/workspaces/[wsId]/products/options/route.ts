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
  inventoryNotFoundResponse,
  isInventoryEnabled,
} from '@/lib/inventory/access';
import { canViewInventoryCatalog } from '@/lib/inventory/permissions';

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

    if (!(await isInventoryEnabled(wsId))) {
      return inventoryNotFoundResponse();
    }

    const permissions = await getPermissions({ wsId, request });
    if (!permissions || !canViewInventoryCatalog(permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await sbAdmin
      .from('workspace_products')
      .select(
        `id, name, description, manufacturer_id, category_id, owner_id, finance_category_id, inventory_manufacturers(id, name), product_categories(name), inventory_owners(id, name, avatar_url, linked_workspace_user_id), transaction_categories(id, name, color, icon), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_units!inventory_products_unit_id_fkey(id, name), inventory_warehouses!inventory_products_warehouse_id_fkey(id, name))`
      )
      .filter('archived', 'eq', 'false')
      .eq('ws_id', wsId)
      .order('name');

    if (error) {
      return NextResponse.json(
        { message: 'Failed to fetch available products' },
        { status: 500 }
      );
    }

    const products = (data ?? []).map((product) => {
      const normalizedProduct = product as typeof product & {
        inventory_manufacturers?: { id: string; name: string | null } | null;
      };

      return {
        ...product,
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
