import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@tuturuuu/inventory-core/permissions';
import { getInventoryCatalogProducts } from '@tuturuuu/inventory-core/product-rpc';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  InventoryProduct,
  RawInventoryProduct,
} from '@tuturuuu/types/primitives/InventoryProductRelations';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  categoryId: z.guid().optional(),
  manufacturerId: z.guid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MEDIUM_TEXT_LENGTH)
    .default(10),
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
  sortBy: z
    .enum([
      'id',
      'name',
      'manufacturer',
      'description',
      'usage',
      'category_id',
      'created_at',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

function selectPrimaryInventory(
  inventories: InventoryProduct[] | null | undefined
) {
  return inventories?.slice().sort((a, b) => {
    const key = (item: InventoryProduct) =>
      [item.warehouse_id ?? '', item.unit_id ?? '', item.created_at ?? ''].join(
        '|'
      );
    return key(a).localeCompare(key(b));
  })[0];
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId, {
      appSessionTargets: ['finance'],
    });
    if (!authorization.ok) return authorization.response;

    const { permissions, wsId } = authorization.value;
    const canCreateSales = canCreateInventorySales(permissions);
    const canViewCatalog =
      canViewInventoryCatalog(permissions) || canCreateSales;
    const includeStock = canViewInventoryStock(permissions) || canCreateSales;

    if (!canViewCatalog) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const searchParams = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = SearchParamsSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const {
      categoryId,
      manufacturerId,
      page,
      pageSize,
      q,
      sortBy,
      sortOrder,
      status,
    } = parsed.data;
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data: rawData, count } = await getInventoryCatalogProducts({
      categoryId,
      includeStock,
      limit: pageSize,
      manufacturerId,
      offset: (page - 1) * pageSize,
      sbAdmin,
      search: q,
      sortBy,
      sortOrder,
      status,
      wsId,
    });

    const data = (rawData ?? []).map((item) => {
      const product = item as RawInventoryProduct & {
        archived?: boolean;
        inventory_manufacturers?: { id: string; name: string | null } | null;
        manufacturer_id?: string | null;
      };
      const primaryInventory = selectPrimaryInventory(item.inventory_products);

      return {
        archived: product.archived ?? false,
        avatar_url: item.avatar_url,
        category: item.product_categories?.name,
        category_id: item.category_id,
        created_at: item.created_at,
        description: item.description,
        finance_category: item.transaction_categories
          ? {
              color: item.transaction_categories.color,
              icon: item.transaction_categories.icon,
              id: item.transaction_categories.id,
              name: item.transaction_categories.name,
            }
          : null,
        finance_category_id: item.finance_category_id,
        id: item.id,
        inventory: includeStock
          ? (item.inventory_products ?? []).map((inventory) => ({
              amount: inventory.amount,
              min_amount: inventory.min_amount ?? 0,
              price: inventory.price ?? 0,
              revenue_share_bps: inventory.revenue_share_bps ?? 0,
              revenue_share_partner: inventory.revenue_share_partner ?? null,
              revenue_share_partner_id:
                inventory.revenue_share_partner_id ?? null,
              unit_id: inventory.unit_id,
              unit_name: inventory.inventory_units?.name ?? null,
              warehouse_id: inventory.warehouse_id,
              warehouse_name: inventory.inventory_warehouses?.name ?? null,
            }))
          : [],
        manufacturer: product.inventory_manufacturers?.name ?? null,
        manufacturer_id: product.manufacturer_id ?? null,
        min_amount: includeStock
          ? (primaryInventory?.min_amount ?? null)
          : null,
        name: item.name,
        owner: item.inventory_owners
          ? {
              avatar_url: item.inventory_owners.avatar_url,
              id: item.inventory_owners.id,
              linked_workspace_user_id:
                item.inventory_owners.linked_workspace_user_id,
              name: item.inventory_owners.name,
            }
          : null,
        owner_id: item.owner_id,
        stock: includeStock
          ? (item.inventory_products ?? []).map((inventory) => ({
              amount: inventory.amount,
              min_amount: inventory.min_amount,
              price: inventory.price,
              revenue_share_bps: inventory.revenue_share_bps ?? 0,
              revenue_share_partner: inventory.revenue_share_partner ?? null,
              revenue_share_partner_id:
                inventory.revenue_share_partner_id ?? null,
              unit: inventory.inventory_units?.name,
              warehouse: inventory.inventory_warehouses?.name,
            }))
          : [],
        unit: includeStock
          ? (primaryInventory?.inventory_units?.name ?? null)
          : null,
        usage: item.usage,
        warehouse: includeStock
          ? (primaryInventory?.inventory_warehouses?.name ?? null)
          : null,
        ws_id: item.ws_id,
      };
    });

    return NextResponse.json({ count: count ?? 0, data });
  } catch (error) {
    console.error('Failed to load Finance invoice products', { error });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
