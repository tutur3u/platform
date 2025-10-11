import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
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
