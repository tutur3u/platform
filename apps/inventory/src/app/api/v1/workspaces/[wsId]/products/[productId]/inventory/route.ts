import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { safelyRevalidateWorkspaceStorefronts } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { validateInventoryItemWorkspaceRelations } from '@tuturuuu/inventory-core/relation-validation';
import { getStockChangeAmount } from '@tuturuuu/inventory-core/stock-change';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import {
  insertProductStockChanges,
  normalizeStockChangeContext,
  stockChangeContextColumns,
  validateStockChangeBeneficiary,
} from './change-context';
import { createInventoryKey, InventoryBodySchema } from './request';

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

const getWorkspaceUserId = async (
  platformUserId: string,
  sbAdmin: TypedSupabaseClient,
  wsId: string
) => {
  const { data: workspaceUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', platformUserId)
    .eq('ws_id', wsId)
    .single();

  return workspaceUser?.virtual_user_id ?? null;
};

export async function POST(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId, userId } = auth.value;
  const sbAdmin = await createAdminClient();
  const inventoryClient = sbAdmin.schema('private');

  // Check permissions
  const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  const parsed = InventoryBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid payload', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { inventory } = parsed.data;

  const inventoryKeys = new Set<string>();
  for (const item of inventory) {
    const key = createInventoryKey(item);
    if (inventoryKeys.has(key)) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: ['duplicate_inventory_key'] },
        { status: 400 }
      );
    }
    inventoryKeys.add(key);
  }

  // Validate that product exists
  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError) {
    console.error('Error validating product inventory target', productError);
    return NextResponse.json(
      { message: 'Error validating product' },
      { status: 500 }
    );
  }

  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const inventoryRelations = await validateInventoryItemWorkspaceRelations({
    inventory,
    inventoryClient,
    wsId,
  });
  if (!inventoryRelations.ok) {
    if (inventoryRelations.status === 500) {
      console.error(inventoryRelations.message, inventoryRelations.error);
    }
    return NextResponse.json(
      { message: inventoryRelations.message },
      { status: inventoryRelations.status }
    );
  }

  // Insert inventory items
  const { error } = await inventoryClient.from('inventory_products').insert(
    inventory.map((item) => ({
      ...item,
      product_id: productId,
    }))
  );

  if (error) {
    console.error('Error creating product inventory', error);
    return NextResponse.json(
      { message: 'Error creating inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(userId, sbAdmin, wsId);
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
        product_id: productId,
        unit_id: item.unit_id,
        warehouse_id: item.warehouse_id,
        amount: difference,
        creator_id: workspaceUserId,
      }));

    if (stockChanges.length > 0) {
      await sbAdmin.from('product_stock_changes').insert(stockChanges);
    }
  }

  await safelyRevalidateWorkspaceStorefronts(wsId);

  return NextResponse.json({ message: 'Inventory created successfully' });
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId, userId } = auth.value;
  const sbAdmin = await createAdminClient();
  const inventoryClient = sbAdmin.schema('private');

  // Check permissions
  const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  const parsed = InventoryBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid payload', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { changeContext, inventory } = parsed.data;
  const normalizedChangeContext = normalizeStockChangeContext(changeContext);
  const beneficiaryValidation = await validateStockChangeBeneficiary({
    beneficiaryId: normalizedChangeContext.beneficiaryId,
    sbAdmin,
    wsId,
  });
  if (!beneficiaryValidation.ok) {
    if (beneficiaryValidation.status === 500) {
      console.error(beneficiaryValidation.message, beneficiaryValidation.error);
    }
    return NextResponse.json(
      { message: beneficiaryValidation.message },
      { status: beneficiaryValidation.status }
    );
  }

  const inventoryKeys = new Set<string>();
  for (const item of inventory) {
    const key = createInventoryKey(item);
    if (inventoryKeys.has(key)) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: ['duplicate_inventory_key'] },
        { status: 400 }
      );
    }
    inventoryKeys.add(key);
  }

  // Validate that product exists
  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const inventoryRelations = await validateInventoryItemWorkspaceRelations({
    inventory,
    inventoryClient,
    wsId,
  });
  if (!inventoryRelations.ok) {
    if (inventoryRelations.status === 500) {
      console.error(inventoryRelations.message, inventoryRelations.error);
    }
    return NextResponse.json(
      { message: inventoryRelations.message },
      { status: inventoryRelations.status }
    );
  }

  // Get existing inventory to compare
  const { data: existingInventory, error: fetchError } = await inventoryClient
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (fetchError) {
    console.error('Error fetching existing product inventory', fetchError);
    return NextResponse.json(
      { message: 'Error fetching existing inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(userId, sbAdmin, wsId);

  // If inventory is empty, clear all existing inventory
  if (inventory.length === 0) {
    if (workspaceUserId && existingInventory?.length) {
      const stockChanges = existingInventory
        .map((item) => ({
          item,
          difference: getStockChangeAmount(item.amount, null),
        }))
        .filter(
          (
            entry
          ): entry is {
            item: (typeof existingInventory)[number];
            difference: number;
          } => entry.difference != null
        )
        .map(({ item, difference }) => ({
          product_id: productId,
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: difference,
          creator_id: workspaceUserId,
          ...stockChangeContextColumns(normalizedChangeContext),
        }));

      if (stockChanges.length > 0) {
        await insertProductStockChanges(sbAdmin, stockChanges);
      }
    }

    const { error: deleteError } = await inventoryClient
      .from('inventory_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      console.error('Error deleting product inventory items', deleteError);
      return NextResponse.json(
        { message: 'Error deleting inventory items' },
        { status: 500 }
      );
    }

    await safelyRevalidateWorkspaceStorefronts(wsId);

    return NextResponse.json({ message: 'Inventory cleared' });
  }

  const existingMap = new Map(
    (existingInventory || []).map((item) => [createInventoryKey(item), item])
  );

  const newMap = new Map(
    inventory.map((item) => [createInventoryKey(item), item])
  );

  // Find items to delete (exist in current but not in new)
  const toDelete = [...existingMap.entries()]
    .filter(([key]) => !newMap.has(key))
    .map(([, item]) => item);

  // Find items to insert (exist in new but not in current)
  const toInsert = inventory.filter(
    (item) => !existingMap.has(createInventoryKey(item))
  );

  // Find items to update (exist in both but with different values)
  const toUpdate = inventory.filter((item) => {
    const key = createInventoryKey(item);
    const existing = existingMap.get(key);
    if (!existing) return false;

    return (
      existing.amount !== item.amount ||
      existing.price !== item.price ||
      existing.min_amount !== item.min_amount ||
      existing.revenue_share_partner_id !==
        (item.revenue_share_partner_id ?? null) ||
      (existing.revenue_share_bps ?? 0) !== item.revenue_share_bps
    );
  });

  // Perform deletions
  if (toDelete.length > 0) {
    for (const item of toDelete) {
      const { unit_id, warehouse_id } = item;
      if (!warehouse_id || !unit_id) {
        console.warn('Invalid product inventory key', {
          warehouse_id,
          unit_id,
        });
        return NextResponse.json(
          { message: 'Invalid inventory key format' },
          { status: 400 }
        );
      }

      // Log stock change for deletion (negative amount)
      if (workspaceUserId) {
        const difference = getStockChangeAmount(item.amount, null);

        if (difference != null) {
          await insertProductStockChanges(sbAdmin, {
            product_id: productId,
            unit_id: unit_id,
            warehouse_id: warehouse_id,
            amount: difference,
            creator_id: workspaceUserId,
            ...stockChangeContextColumns(normalizedChangeContext),
          });
        }
      }

      const { error: deleteError } = await inventoryClient
        .from('inventory_products')
        .delete()
        .eq('product_id', productId)
        .eq('warehouse_id', warehouse_id)
        .eq('unit_id', unit_id);

      if (deleteError) {
        console.error('Error deleting product inventory item', deleteError);
        return NextResponse.json(
          { message: 'Error deleting inventory items' },
          { status: 500 }
        );
      }
    }
  }

  // Perform insertions
  if (toInsert.length > 0) {
    const { error: insertError } = await inventoryClient
      .from('inventory_products')
      .insert(
        toInsert.map((item) => ({
          ...item,
          product_id: productId,
        }))
      );

    if (insertError) {
      console.error('Error inserting product inventory items', insertError);
      return NextResponse.json(
        { message: 'Error inserting new inventory items' },
        { status: 500 }
      );
    }

    // Log stock changes for insertions (positive amount)
    if (workspaceUserId) {
      const stockChanges = toInsert
        .map((item) => ({
          item,
          difference: getStockChangeAmount(null, item.amount),
        }))
        .filter(
          (
            entry
          ): entry is {
            item: (typeof toInsert)[number];
            difference: number;
          } => entry.difference != null
        )
        .map(({ item, difference }) => ({
          product_id: productId,
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: difference,
          creator_id: workspaceUserId,
          ...stockChangeContextColumns(normalizedChangeContext),
        }));

      if (stockChanges.length > 0) {
        await insertProductStockChanges(sbAdmin, stockChanges);
      }
    }
  }

  // Perform updates
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      const existing = existingMap.get(createInventoryKey(item));

      if (existing && workspaceUserId) {
        const stockDifference = getStockChangeAmount(
          existing.amount,
          item.amount
        );

        if (stockDifference != null) {
          await insertProductStockChanges(sbAdmin, {
            product_id: productId,
            unit_id: item.unit_id,
            warehouse_id: item.warehouse_id,
            amount: stockDifference,
            creator_id: workspaceUserId,
            ...stockChangeContextColumns(normalizedChangeContext),
          });
        }
      }

      const { error: updateError } = await inventoryClient
        .from('inventory_products')
        .update({
          amount: item.amount,
          price: item.price,
          min_amount: item.min_amount,
          revenue_share_partner_id: item.revenue_share_partner_id ?? null,
          revenue_share_bps: item.revenue_share_bps,
        })
        .eq('product_id', productId)
        .eq('warehouse_id', item.warehouse_id)
        .eq('unit_id', item.unit_id);

      if (updateError) {
        console.error('Error updating product inventory item', updateError);
        return NextResponse.json(
          { message: 'Error updating inventory items' },
          { status: 500 }
        );
      }
    }
  }

  await safelyRevalidateWorkspaceStorefronts(wsId);

  return NextResponse.json({
    message: 'Inventory updated successfully',
    changes: {
      deleted: toDelete.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
    },
  });
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  const sbAdmin = await createAdminClient();
  const inventoryClient = sbAdmin.schema('private');

  const { containsPermission } = permissions;
  if (!containsPermission('view_stock_quantity')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Get inventory for this product
  const { data: inventory, error } = await inventoryClient
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (error) {
    console.error('Error fetching product inventory', error);
    return NextResponse.json(
      { message: 'Error fetching inventory' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: inventory });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;
  const auth = await authorizeInventoryWorkspace(req, id, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId, userId } = auth.value;
  const sbAdmin = await createAdminClient();
  const inventoryClient = sbAdmin.schema('private');

  // Check permissions
  const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  // Check worksapce product exists
  const { data: product, error: productError } = await sbAdmin
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const { data: existingInventory, error: fetchError } = await inventoryClient
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (fetchError) {
    console.error('Error fetching product inventory before delete', fetchError);
    return NextResponse.json(
      { message: 'Error fetching existing inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(userId, sbAdmin, wsId);
  if (workspaceUserId && existingInventory?.length) {
    const stockChanges = existingInventory
      .map((item) => ({
        item,
        difference: getStockChangeAmount(item.amount, null),
      }))
      .filter(
        (
          entry
        ): entry is {
          item: (typeof existingInventory)[number];
          difference: number;
        } => entry.difference != null
      )
      .map(({ item, difference }) => ({
        product_id: productId,
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
        console.error('Error logging stock changes', stockChangeError);
      }
    }
  }

  // Delete all inventory for this product
  const { error } = await inventoryClient
    .from('inventory_products')
    .delete()
    .eq('product_id', productId);

  if (error) {
    console.error('Error deleting product inventory', error);
    return NextResponse.json(
      { message: 'Error deleting inventory' },
      { status: 500 }
    );
  }

  await safelyRevalidateWorkspaceStorefronts(wsId);

  return NextResponse.json({ message: 'Inventory deleted successfully' });
}
