import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId: id, productId } = await params;

  // Resolve workspace ID
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('view_inventory')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_products')
    .select(
      '*, product_categories(name), inventory_products!inventory_products_product_id_fkey(amount, min_amount, price, unit_id, warehouse_id, inventory_warehouses!inventory_products_warehouse_id_fkey(name), inventory_units!inventory_products_unit_id_fkey(name)), product_stock_changes!product_stock_changes_product_id_fkey(amount, created_at, beneficiary:workspace_users!product_stock_changes_beneficiary_id_fkey(full_name, email), creator:workspace_users!product_stock_changes_creator_id_fkey(full_name, email))'
    )
    .eq('ws_id', wsId)
    .eq('id', productId)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const item = data;

  type InventoryProduct = {
    amount: number | null;
    min_amount: number | null;
    price: number | null;
    unit_id: string | null;
    warehouse_id: string | null;
    inventory_warehouses: { name: string | null } | null;
    inventory_units: { name: string | null } | null;
  };

  type ProductStockChange = {
    amount: number;
    created_at: string;
    beneficiary: { full_name: string | null; email: string | null } | null;
    creator: { full_name: string | null; email: string | null } | null;
  };

  const formattedProduct = {
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    description: item.description,
    usage: item.usage,
    unit: (item.inventory_products as unknown as InventoryProduct[])?.[0]
      ?.inventory_units?.name,
    stock: (
      (item.inventory_products as unknown as InventoryProduct[] | null) || []
    ).map((inventory: InventoryProduct) => ({
      amount: inventory.amount,
      min_amount: inventory.min_amount,
      unit: inventory.inventory_units?.name,
      warehouse: inventory.inventory_warehouses?.name,
      price: inventory.price,
    })),
    // Inventory with ids for editing
    inventory: (
      (item.inventory_products as unknown as InventoryProduct[] | null) || []
    ).map((inventory: InventoryProduct) => ({
      unit_id: inventory.unit_id,
      warehouse_id: inventory.warehouse_id,
      amount: inventory.amount,
      min_amount: inventory.min_amount,
      price: inventory.price,
    })),
    min_amount:
      (item.inventory_products as unknown as InventoryProduct[])?.[0]
        ?.min_amount || 0,
    warehouse: (item.inventory_products as unknown as InventoryProduct[])?.[0]
      ?.inventory_warehouses?.name,
    category: (
      item.product_categories as unknown as { name: string | null } | null
    )?.name,
    category_id: item.category_id,
    ws_id: item.ws_id,
    created_at: item.created_at,
    stock_changes:
      (item.product_stock_changes as unknown as ProductStockChange[])?.map(
        (change: ProductStockChange) => ({
          amount: change.amount,
          creator: change.creator,
          beneficiary: change.beneficiary,
          created_at: change.created_at,
        })
      ) || [],
  };

  return NextResponse.json(formattedProduct);
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, productId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('update_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update products' },
      { status: 403 }
    );
  }

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
    .eq('id', productId);

  if (product.error) {
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error updating product' },
      { status: 500 }
    );
  }

  // Update inventory if provided
  if (inventory && Array.isArray(inventory) && inventory.length > 0) {
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
  const { productId } = await params;

  const { error } = await supabase
    .from('workspace_products')
    .delete()
    .eq('id', productId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace product' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
