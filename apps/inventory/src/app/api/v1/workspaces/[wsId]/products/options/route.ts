import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryCatalogProducts } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const sbAdmin = await createAdminClient();
    const authorization = await authorizeInventoryWorkspace(request, id);
    if (!authorization.ok) return authorization.response;
    const { permissions, wsId } = authorization.value;
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
    console.error('Error fetching product options:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
