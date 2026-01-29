import { createClient } from '@tuturuuu/supabase/next/server';
import type { RawInventoryProductWithChanges } from '@tuturuuu/types/primitives/InventoryProductRelations';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
  productId: z.string().min(1),
});

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;

  // Resolve workspace ID
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('view_inventory')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const canViewStockQuantity = containsPermission('view_stock_quantity');

  const supabase = await createClient();

  const selectFields = canViewStockQuantity
    ? '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, created_at, inventory_warehouses!inventory_products_warehouse_id_fkey(id, name), inventory_units!inventory_products_unit_id_fkey(id, name)), product_stock_changes!product_stock_changes_product_id_fkey(amount, created_at, beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(full_name, email), creator:workspace_users!product_stock_changes_creator_id_fkey(full_name, email), warehouse:inventory_warehouses!product_stock_changes_warehouse_id_fkey(id, name))'
    : '*, product_categories(name)';

  const { data, error } = await supabase
    .from('workspace_products')
    .select(selectFields)
    .eq('ws_id', wsId)
    .eq('id', productId)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const item = data as unknown as RawInventoryProductWithChanges;

  const formattedProduct = {
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    description: item.description,
    usage: item.usage,
    unit: canViewStockQuantity
      ? item.inventory_products?.[0]?.inventory_units?.name
      : null,
    stock: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory) => ({
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          unit: inventory.inventory_units?.name,
          warehouse: inventory.inventory_warehouses?.name,
          price: inventory.price,
        }))
      : [],
    // Inventory with ids for editing
    inventory: canViewStockQuantity
      ? (item.inventory_products || []).map((inventory) => ({
          unit_id: inventory.unit_id,
          warehouse_id: inventory.warehouse_id,
          amount: inventory.amount,
          min_amount: inventory.min_amount,
          price: inventory.price,
        }))
      : [],
    min_amount: canViewStockQuantity
      ? item.inventory_products?.[0]?.min_amount || 0
      : 0,
    warehouse: canViewStockQuantity
      ? item.inventory_products?.[0]?.inventory_warehouses?.name
      : null,
    category: item.product_categories?.name,
    category_id: item.category_id,
    ws_id: item.ws_id,
    created_at: item.created_at,
    stock_changes: canViewStockQuantity
      ? item.product_stock_changes?.map((change) => ({
          amount: change.amount,
          creator: change.creator,
          beneficiary: change.beneficiary,
          warehouse: change.warehouse,
          created_at: change.created_at,
        })) || []
      : [],
  };

  return NextResponse.json(formattedProduct);
}

export async function PATCH(req: Request, { params }: Params) {
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update products' },
      { status: 403 }
    );
  }

  const canUpdateStockQuantity = containsPermission('update_stock_quantity');

  const supabase = await createClient();
  const { inventory, ...data } = (await req.json()) as Product2 & {
    inventory?: ProductInventory[];
  };

  // Update product details
  const product = await supabase
    .from('workspace_products')
    .update({
      ...data,
    })
    .eq('id', productId)
    .eq('ws_id', wsId);

  if (product.error) {
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error updating product' },
      { status: 500 }
    );
  }

  // Update inventory if provided
  if (inventory && Array.isArray(inventory) && inventory.length > 0) {
    if (!canUpdateStockQuantity) {
      return NextResponse.json(
        { message: 'Insufficient permissions to update stock quantities' },
        { status: 403 }
      );
    }
    // First, delete existing inventory for this product
    const { error: deleteError } = await supabase
      .from('inventory_products')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      console.log(deleteError);
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }

    // Then insert the new inventory
    const { error: insertError } = await supabase
      .from('inventory_products')
      .insert(
        inventory.map((item) => ({
          ...item,
          product_id: productId,
        }))
      );

    if (insertError) {
      console.log(insertError);
      return NextResponse.json(
        { message: 'Error updating inventory' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const parsedParams = RouteParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid route parameters' },
      { status: 400 }
    );
  }

  const { wsId: id, productId } = parsedParams.data;
  const wsId = await normalizeWorkspaceId(id);

  const { data: product, error: productError } = await supabase
    .from('workspace_products')
    .select('id, ws_id')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  if (product.ws_id !== wsId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { error } = await supabase
    .from('workspace_products')
    .delete()
    .eq('id', productId)
    .eq('ws_id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace product' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
