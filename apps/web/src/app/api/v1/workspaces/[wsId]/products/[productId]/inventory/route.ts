import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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

export async function POST(req: Request, { params }: Params) {
  const { wsId, productId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create inventory' },
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

  return NextResponse.json({ message: 'Inventory created successfully' });
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, productId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update inventory' },
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

  // If inventory is empty, clear all existing inventory
  if (inventory.length === 0) {
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

  let workspaceUserId: string | null = null;
  if (user) {
    const { data: workspaceUser } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('ws_id', (await params).wsId)
      .single();

    workspaceUserId = workspaceUser?.virtual_user_id || null;
  }

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
        if (existingItem?.amount) {
          await supabase.from('product_stock_changes').insert({
            product_id: productId,
            unit_id: unit_id,
            warehouse_id: warehouse_id,
            amount: -(existingItem.amount || 0), // Negative for deletion
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
        .filter((item) => item.amount != null)
        .map((item) => ({
          product_id: productId,
          unit_id: item.unit_id,
          warehouse_id: item.warehouse_id,
          amount: item.amount ?? 0,
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

      // Log stock changes before updating
      if (
        existing &&
        existing.amount !== item.amount &&
        existing.amount != null &&
        item.amount != null
      ) {
        const existingAmount = existing.amount || 0;
        const newAmount = item.amount || 0;
        const stockDifference = newAmount - existingAmount;

        // Get current user and workspace user for logging
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // Get workspace user ID for the current platform user
          const { data: workspaceUser } = await supabase
            .from('workspace_user_linked_users')
            .select('virtual_user_id')
            .eq('platform_user_id', user.id)
            .eq('ws_id', (await params).wsId)
            .single();

          if (workspaceUser) {
            // Log the stock change
            await supabase.from('product_stock_changes').insert({
              product_id: productId,
              unit_id: item.unit_id,
              warehouse_id: item.warehouse_id,
              amount: stockDifference,
              creator_id: workspaceUser.virtual_user_id,
            });
          }
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
  const supabase = await createClient();
  const { productId } = await params;

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
  const { wsId, productId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('delete_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to delete inventory' },
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
