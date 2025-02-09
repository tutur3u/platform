import { createClient } from '@tutur3u/supabase/next/server';
import { Product2 } from '@repo/types/primitives/Product';
import { ProductInventory } from '@repo/types/primitives/ProductInventory';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = (await req.json()) as Product2 & {
    inventory: ProductInventory[];
  };
  const { productId } = await params;

  let product = await supabase
    .from('workspace_products')
    .update({
      ...data,
      inventory: undefined,
    })
    .eq('id', productId);

  if (product.error) {
    // TODO: logging
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error creating product' },
      { status: 500 }
    );
  }

  let inventory = await supabase.from('inventory_products').upsert(
    data.inventory.map((inventory) => ({
      ...inventory,
      product_id: productId,
    }))
  );

  if (inventory.error) {
    console.log(inventory.error);
    return NextResponse.json(
      { message: 'Error creating inventory' },
      { status: 500 }
    );
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
