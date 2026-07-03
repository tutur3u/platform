import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_URL_LENGTH,
} from '@tuturuuu/utils/constants';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { createInventoryAuditLog } from '@/lib/inventory/audit';
import { autoCreateProductListing } from '@/lib/inventory/commerce/auto-listing';
import { resolveProductManufacturerId } from '@/lib/inventory/manufacturers';
import {
  canAdjustInventoryStock,
  canManageInventoryCatalog,
} from '@/lib/inventory/permissions';
import { validateInventoryItemWorkspaceRelations } from '@/lib/inventory/relation-validation';
import { getStockChangeAmount } from '@/lib/inventory/stock-change';

const InventoryItemSchema = z.object({
  unit_id: z.guid(),
  warehouse_id: z.guid(),
  amount: z.number().nonnegative().nullable(),
  min_amount: z.number().nonnegative(),
  price: z.number().nonnegative(),
  revenue_share_partner_id: z.guid().nullable().optional(),
  revenue_share_bps: z.number().int().min(0).max(10000).default(0),
});

export const InventoryProductCreateSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  avatar_url: z.url().max(MAX_URL_LENGTH).nullable().optional(),
  manufacturer_id: z.guid().nullable().optional(),
  manufacturer: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  usage: z.string().max(MAX_MEDIUM_TEXT_LENGTH).optional(),
  category_id: z.guid(),
  owner_id: z.guid().optional(),
  finance_category_id: z.guid().nullable().optional(),
  inventory: z.array(InventoryItemSchema).default([]),
});

export type InventoryProductCreatePayload = z.infer<
  typeof InventoryProductCreateSchema
>;

async function getWorkspaceUserId({
  actorAuthUserId,
  sbAdmin,
  wsId,
}: {
  actorAuthUserId: string | null;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  if (!actorAuthUserId) return null;

  const { data: workspaceUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', actorAuthUserId)
    .eq('ws_id', wsId)
    .single();

  return workspaceUser?.virtual_user_id ?? null;
}

async function validateProductRelations({
  sbAdmin,
  wsId,
  categoryId,
  ownerId,
  financeCategoryId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  categoryId: string;
  ownerId: string;
  financeCategoryId?: string | null;
}) {
  const inventory = sbAdmin.schema('private');
  const [categoryResult, ownerResult, financeCategoryResult] =
    await Promise.all([
      sbAdmin
        .from('product_categories')
        .select('id')
        .eq('id', categoryId)
        .eq('ws_id', wsId)
        .maybeSingle(),
      inventory
        .from('inventory_owners')
        .select('id')
        .eq('id', ownerId)
        .eq('ws_id', wsId)
        .maybeSingle(),
      financeCategoryId
        ? sbAdmin
            .from('transaction_categories')
            .select('id')
            .eq('id', financeCategoryId)
            .eq('ws_id', wsId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (categoryResult.error || !categoryResult.data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid product category' },
        { status: 400 }
      ),
    };
  }

  if (ownerResult.error || !ownerResult.data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid inventory owner' },
        { status: 400 }
      ),
    };
  }

  if (
    financeCategoryId &&
    (financeCategoryResult.error || !financeCategoryResult.data)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Invalid finance transaction category' },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const };
}

async function resolveDefaultOwnerId({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('inventory_owners')
    .select('id')
    .eq('ws_id', wsId)
    .eq('name', 'Unassigned')
    .maybeSingle();

  if (error || !data) return null;

  return data.id;
}

export async function createInventoryProductResponse({
  actorAuthUserId,
  payload,
  permissions,
  sbAdmin,
  wsId,
}: {
  actorAuthUserId: string | null;
  payload: InventoryProductCreatePayload;
  permissions: PermissionsResult;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const inventoryClient = sbAdmin.schema('private');

  if (!canManageInventoryCatalog(permissions)) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create products' },
      { status: 403 }
    );
  }

  const { inventory, owner_id, manufacturer, manufacturer_id, ...data } =
    payload;
  const resolvedManufacturer = await resolveProductManufacturerId({
    sbAdmin,
    wsId,
    manufacturerId: manufacturer_id,
    legacyManufacturerName: manufacturer,
  });
  if (!resolvedManufacturer.ok) {
    return NextResponse.json(
      { message: resolvedManufacturer.message },
      { status: 400 }
    );
  }

  const resolvedOwnerId =
    owner_id ??
    (await resolveDefaultOwnerId({
      sbAdmin,
      wsId,
    }));
  if (!resolvedOwnerId) {
    return NextResponse.json(
      { message: 'Missing inventory owner configuration' },
      { status: 400 }
    );
  }

  const validatedRelations = await validateProductRelations({
    sbAdmin,
    wsId,
    categoryId: data.category_id,
    ownerId: resolvedOwnerId,
    financeCategoryId: data.finance_category_id,
  });
  if (!validatedRelations.ok) return validatedRelations.response;

  if (inventory.length > 0) {
    if (!canAdjustInventoryStock(permissions)) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }

    const inventoryRelations = await validateInventoryItemWorkspaceRelations({
      inventory,
      inventoryClient,
      wsId,
    });
    if (!inventoryRelations.ok) {
      if (inventoryRelations.status === 500) {
        serverLogger.error(
          inventoryRelations.message,
          inventoryRelations.error
        );
      }
      return NextResponse.json(
        { message: inventoryRelations.message },
        { status: inventoryRelations.status }
      );
    }
  }

  const workspaceUserId = await getWorkspaceUserId({
    actorAuthUserId,
    sbAdmin,
    wsId,
  });

  const product = await sbAdmin
    .from('workspace_products')
    .insert({
      ...data,
      owner_id: resolvedOwnerId,
      manufacturer_id: resolvedManufacturer.manufacturerId ?? null,
      ws_id: wsId,
    })
    .select(
      'id, name, avatar_url, owner_id, finance_category_id, category_id, manufacturer_id'
    )
    .single();

  if (product.error) {
    serverLogger.error('Error creating product', product.error);
    return NextResponse.json(
      { message: 'Error creating product' },
      { status: 500 }
    );
  }

  if (inventory.length > 0) {
    const { error } = await inventoryClient.from('inventory_products').insert(
      inventory.map((item) => ({
        ...item,
        product_id: product.data.id,
      }))
    );

    if (error) {
      await sbAdmin
        .from('workspace_products')
        .delete()
        .eq('id', product.data.id)
        .eq('ws_id', wsId);
      serverLogger.error('Error creating inventory for product', error);
      return NextResponse.json(
        { message: 'Error creating inventory' },
        { status: 500 }
      );
    }

    if (workspaceUserId) {
      const stockChanges = inventory
        .map((item) => ({
          item,
          difference: getStockChangeAmount(null, item.amount),
        }))
        .filter(
          (
            entry
          ): entry is {
            item: (typeof inventory)[number];
            difference: number;
          } => entry.difference != null
        )
        .map(({ item, difference }) => ({
          product_id: product.data.id,
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: difference,
          creator_id: workspaceUserId,
        }));

      if (stockChanges.length > 0) {
        const { error: stockChangeError } = await sbAdmin
          .from('product_stock_changes')
          .insert(stockChanges);
        if (stockChangeError) {
          serverLogger.error('Error logging stock changes', stockChangeError);
        }
      }
    }
  }

  await createInventoryAuditLog(sbAdmin, {
    wsId,
    eventKind: 'created',
    entityKind: 'product',
    entityId: product.data.id,
    entityLabel: product.data.name ?? data.name,
    summary: `Created product ${data.name}`,
    changedFields: [
      'name',
      ...(data.avatar_url ? ['avatar_url'] : []),
      'category_id',
      'owner_id',
      ...(resolvedManufacturer.manufacturerId ? ['manufacturer_id'] : []),
      ...(data.finance_category_id ? ['finance_category_id'] : []),
      ...(inventory.length > 0 ? ['inventory'] : []),
    ],
    after: {
      ...data,
      manufacturer_id: resolvedManufacturer.manufacturerId ?? null,
      inventory,
    },
    actor: {
      authUserId: actorAuthUserId,
      workspaceUserId,
    },
  });

  // Auto-surface the product as a draft storefront listing so it is sellable
  // and converges to Polar without a manual publish step. Best-effort.
  const firstInventory = inventory[0];
  if (firstInventory) {
    await autoCreateProductListing(wsId, {
      priceMajor: firstInventory.price,
      productId: product.data.id,
      title: product.data.name ?? data.name,
      unitId: firstInventory.unit_id,
      warehouseId: firstInventory.warehouse_id,
    });
  }

  return NextResponse.json({ message: 'success' });
}
