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
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import {
  canCreateInventorySales,
  canViewInventoryCatalog,
  canViewInventoryStock,
} from '@tuturuuu/inventory-core/permissions';
import {
  createInventoryProductResponse,
  InventoryProductCreateSchema,
} from '@tuturuuu/inventory-core/product-create';
import { getInventoryCatalogProducts } from '@tuturuuu/inventory-core/product-rpc';

const SearchParamsSchema = z.object({
  categoryId: z.guid().optional(),
  manufacturerId: z.guid().optional(),
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MEDIUM_TEXT_LENGTH)
    .default(10),
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
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const sbAdmin = await createAdminClient();
    const { wsId: id } = await params;
    const authorization = await authorizeInventoryWorkspace(request, id, {
      appSessionTargets: ['inventory', 'finance'],
    });
    if (!authorization.ok) return authorization.response;

    const { permissions, wsId } = authorization.value;
    const canCreateSales = canCreateInventorySales(permissions);
    const canViewInventory =
      canViewInventoryCatalog(permissions) || canCreateSales;
    const canViewStockQuantity =
      canViewInventoryStock(permissions) || canCreateSales;

    if (!canViewInventory) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const params_obj: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      params_obj[key] = value;
    });

    const parsed = SearchParamsSchema.safeParse(params_obj);
    if (!parsed.success) {
      serverLogger.error('Invalid query parameters:', parsed.error);
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }
    const {
      categoryId,
      manufacturerId,
      q,
      page,
      pageSize,
      status,
      sortBy,
      sortOrder,
    } = parsed.data;

    const start = (page - 1) * pageSize;
    const { data: rawData, count } = await getInventoryCatalogProducts({
      categoryId,
      includeStock: canViewStockQuantity,
      limit: pageSize,
      manufacturerId,
      offset: start,
      sbAdmin,
      search: q,
      sortBy,
      sortOrder,
      status,
      wsId,
    });

    const selectPrimaryInventory = (
      inventories: InventoryProduct[] | null | undefined
    ) => {
      if (!inventories?.length) return undefined;

      return inventories.slice().sort((a, b) => {
        const aKey = [
          a.warehouse_id ?? '',
          a.unit_id ?? '',
          a.created_at ?? '',
        ].join('|');
        const bKey = [
          b.warehouse_id ?? '',
          b.unit_id ?? '',
          b.created_at ?? '',
        ].join('|');

        return aKey.localeCompare(bKey);
      })[0];
    };

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
        id: item.id,
        name: item.name,
        manufacturer_id: product.manufacturer_id ?? null,
        manufacturer: product.inventory_manufacturers?.name ?? null,
        description: item.description,
        usage: item.usage,
        unit: canViewStockQuantity
          ? (primaryInventory?.inventory_units?.name ?? null)
          : null,
        stock: canViewStockQuantity
          ? (item.inventory_products || []).map((inventory) => ({
              amount: inventory.amount,
              min_amount: inventory.min_amount,
              unit: inventory.inventory_units?.name,
              warehouse: inventory.inventory_warehouses?.name,
              price: inventory.price,
              revenue_share_partner_id:
                inventory.revenue_share_partner_id ?? null,
              revenue_share_bps: inventory.revenue_share_bps ?? 0,
              revenue_share_partner: inventory.revenue_share_partner ?? null,
            }))
          : [],
        inventory: canViewStockQuantity
          ? (item.inventory_products || []).map((inventory) => ({
              unit_id: inventory.unit_id,
              warehouse_id: inventory.warehouse_id,
              amount: inventory.amount,
              min_amount: inventory.min_amount ?? 0,
              price: inventory.price ?? 0,
              revenue_share_partner_id:
                inventory.revenue_share_partner_id ?? null,
              revenue_share_bps: inventory.revenue_share_bps ?? 0,
              revenue_share_partner: inventory.revenue_share_partner ?? null,
              unit_name: inventory.inventory_units?.name ?? null,
              warehouse_name: inventory.inventory_warehouses?.name ?? null,
            }))
          : [],
        min_amount: canViewStockQuantity
          ? (primaryInventory?.min_amount ?? null)
          : null,
        warehouse: canViewStockQuantity
          ? (primaryInventory?.inventory_warehouses?.name ?? null)
          : null,
        category: item.product_categories?.name,
        category_id: item.category_id,
        owner_id: item.owner_id,
        owner: item.inventory_owners
          ? {
              id: item.inventory_owners.id,
              name: item.inventory_owners.name,
              avatar_url: item.inventory_owners.avatar_url,
              linked_workspace_user_id:
                item.inventory_owners.linked_workspace_user_id,
            }
          : null,
        finance_category_id: item.finance_category_id,
        finance_category: item.transaction_categories
          ? {
              id: item.transaction_categories.id,
              name: item.transaction_categories.name,
              color: item.transaction_categories.color,
              icon: item.transaction_categories.icon,
            }
          : null,
        ws_id: item.ws_id,
        created_at: item.created_at,
      };
    });

    return NextResponse.json({
      data,
      count: count ?? 0,
    });
  } catch (error) {
    serverLogger.error('Error in workspace products API:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const sbAdmin = await createAdminClient();
    const { wsId: id } = await params;
    const authorization = await authorizeInventoryWorkspace(request, id, {
      appSessionTargets: ['inventory'],
    });
    if (!authorization.ok) return authorization.response;

    const parsed = InventoryProductCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    return createInventoryProductResponse({
      actorAuthUserId: authorization.value.userId,
      payload: parsed.data,
      permissions: authorization.value.permissions,
      sbAdmin,
      wsId: authorization.value.wsId,
    });
  } catch (error) {
    serverLogger.error('Error creating inventory product:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
