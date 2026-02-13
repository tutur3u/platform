import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStockChangeAmount } from '@/lib/inventory/stock-change';

const InventoryItemSchema = z.object({
  warehouse_id: z.uuid(),
  unit_id: z.uuid(),
  amount: z.number().nonnegative().nullable(),
  min_amount: z.number().nonnegative().optional(),
  price: z.number().nonnegative(),
});
const BodySchema = z.object({
  inventory: z.array(InventoryItemSchema).default([]),
});

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

const getWorkspaceUserId = async (
  supabase: TypedSupabaseClient,
  wsId: string
) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: workspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  return workspaceUser?.virtual_user_id ?? null;
};

export async function POST(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;

  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid payload', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { inventory } = parsed.data;

  const inventoryKeys = new Set<string>();
  for (const item of inventory) {
    const key = `${item.warehouse_id}-${item.unit_id}`;
    if (inventoryKeys.has(key)) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: ['duplicate_inventory_key'] },
        { status: 400 }
      );
    }
    inventoryKeys.add(key);
  }

  // Validate that product exists
  const { data: product, error: productError } = await supabase
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .single();

  if (productError) {
    console.log(productError);
    return NextResponse.json(
      { message: 'Error validating product' },
      { status: 500 }
    );
  }

  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Insert inventory items
  const { error } = await supabase.from('inventory_products').insert(
    inventory.map((item) => ({
      ...item,
      product_id: productId,
    }))
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(supabase, wsId);
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
      await supabase.from('product_stock_changes').insert(stockChanges);
    }
  }

  return NextResponse.json({ message: 'Inventory created successfully' });
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId: id, productId } = await params;

  const wsId = await normalizeWorkspaceId(id);
  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid payload', errors: parsed.error.issues },
      { status: 400 }
    );
  }
  const { inventory } = parsed.data;

  const inventoryKeys = new Set<string>();
  for (const item of inventory) {
    const key = `${item.warehouse_id}-${item.unit_id}`;
    if (inventoryKeys.has(key)) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: ['duplicate_inventory_key'] },
        { status: 400 }
      );
    }
    inventoryKeys.add(key);
  }

  // Validate that product exists
  const { data: product, error: productError } = await supabase
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .single();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  // Get existing inventory to compare
  const { data: existingInventory, error: fetchError } = await supabase
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (fetchError) {
    console.log(fetchError);
    return NextResponse.json(
      { message: 'Error fetching existing inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(supabase, wsId);

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
        }));

      if (stockChanges.length > 0) {
        await supabase.from('product_stock_changes').insert(stockChanges);
      }
    }

    const { error: deleteError } = await supabase
      .from('inventory_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      console.log(deleteError);
      return NextResponse.json(
        { message: 'Error deleting inventory items' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Inventory cleared' });
  }

  // Create a key for comparison (warehouse_id + unit_id combination)
  const createKey = (item: any) => `${item.warehouse_id}-${item.unit_id}`;

  const existingMap = new Map(
    (existingInventory || []).map((item) => [createKey(item), item])
  );

  const newMap = new Map(inventory.map((item) => [createKey(item), item]));

  // Find items to delete (exist in current but not in new)
  const toDelete = [...existingMap.keys()].filter((key) => !newMap.has(key));

  // Find items to insert (exist in new but not in current)
  const toInsert = inventory.filter(
    (item) => !existingMap.has(createKey(item))
  );

  // Find items to update (exist in both but with different values)
  const toUpdate = inventory.filter((item) => {
    const key = createKey(item);
    const existing = existingMap.get(key);
    if (!existing) return false;

    return (
      existing.amount !== item.amount ||
      existing.price !== item.price ||
      existing.min_amount !== item.min_amount
    );
  });

  // Perform deletions
  if (toDelete.length > 0) {
    for (const key of toDelete) {
      const [warehouse_id, unit_id] = key.split('-');
      if (!warehouse_id || !unit_id) {
        console.log('Invalid warehouse_id or unit_id:', warehouse_id, unit_id);
        return NextResponse.json(
          { message: 'Invalid inventory key format' },
          { status: 400 }
        );
      }

      // Log stock change for deletion (negative amount)
      if (workspaceUserId) {
        const existingItem = existingMap.get(key);
        const difference = getStockChangeAmount(existingItem?.amount, null);

        if (difference != null) {
          await supabase.from('product_stock_changes').insert({
            product_id: productId,
            unit_id: unit_id,
            warehouse_id: warehouse_id,
            amount: difference,
            creator_id: workspaceUserId,
          });
        }
      }

      const { error: deleteError } = await supabase
        .from('inventory_products')
        .delete()
        .eq('product_id', productId)
        .eq('warehouse_id', warehouse_id)
        .eq('unit_id', unit_id);

      if (deleteError) {
        console.log(deleteError);
        return NextResponse.json(
          { message: 'Error deleting inventory items' },
          { status: 500 }
        );
      }
    }
  }

  // Perform insertions
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('inventory_products')
      .insert(
        toInsert.map((item) => ({
          ...item,
          product_id: productId,
        }))
      );

    if (insertError) {
      console.log(insertError);
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
        }));

      if (stockChanges.length > 0) {
        await supabase.from('product_stock_changes').insert(stockChanges);
      }
    }
  }

  // Perform updates
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      const existing = existingMap.get(createKey(item));

      if (existing && workspaceUserId) {
        const stockDifference = getStockChangeAmount(
          existing.amount,
          item.amount
        );

        if (stockDifference != null) {
          await supabase.from('product_stock_changes').insert({
            product_id: productId,
            unit_id: item.unit_id,
            warehouse_id: item.warehouse_id,
            amount: stockDifference,
            creator_id: workspaceUserId,
          });
        }
      }

      const { error: updateError } = await supabase
        .from('inventory_products')
        .update({
          amount: item.amount,
          price: item.price,
          min_amount: item.min_amount,
        })
        .eq('product_id', productId)
        .eq('warehouse_id', item.warehouse_id)
        .eq('unit_id', item.unit_id);

      if (updateError) {
        console.log(updateError);
        return NextResponse.json(
          { message: 'Error updating inventory items' },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    message: 'Inventory updated successfully',
    changes: {
      deleted: toDelete.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
    },
  });
}

export async function GET(_: Request, { params }: Params) {
  const { wsId: id, productId } = await params;

  const wsId = await normalizeWorkspaceId(id);
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('view_stock_quantity')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // Get inventory for this product
  const { data: inventory, error } = await supabase
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching inventory' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: inventory });
}

export async function DELETE(_: Request, { params }: Params) {
  const { wsId: id, productId } = await params;

  const wsId = await normalizeWorkspaceId(id);
  // Check permissions
  const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { containsPermission } = permissions;
  if (!containsPermission('update_stock_quantity')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update stock quantities' },
      { status: 403 }
    );
  }

  const supabase = await createClient();

  // Check worksapce product exists
  const { data: product, error: productError } = await supabase
    .from('workspace_products')
    .select('id')
    .eq('id', productId)
    .eq('ws_id', wsId)
    .single();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const { data: existingInventory, error: fetchError } = await supabase
    .from('inventory_products')
    .select('*')
    .eq('product_id', productId);

  if (fetchError) {
    console.log(fetchError);
    return NextResponse.json(
      { message: 'Error fetching existing inventory' },
      { status: 500 }
    );
  }

  const workspaceUserId = await getWorkspaceUserId(supabase, wsId);
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
      const { error: stockChangeError } = await supabase
        .from('product_stock_changes')
        .insert(stockChanges);
      if (stockChangeError) {
        console.error('Error logging stock changes', stockChangeError);
      }
    }
  }

  // Delete all inventory for this product
  const { error } = await supabase
    .from('inventory_products')
    .delete()
    .eq('product_id', productId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting inventory' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Inventory deleted successfully' });
}
