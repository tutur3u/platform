import { Product2 } from '@/types/primitives/Product';
import { ProductInventory } from '@/types/primitives/ProductInventory';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = (await req.json()) as Product2 & {
    inventory: ProductInventory[];
  };
  const { wsId } = await params;

  let product = await supabase
    .from('workspace_products')
    .insert({
      ...data,
      ws_id: wsId,
      inventory: undefined,
    })
    .select('id')
    .single();

  if (product.error) {
    // TODO: logging
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error creating product' },
      { status: 500 }
    );
  }

  let inventory = await supabase.from('inventory_products').insert(
    data.inventory.map((inventory) => ({
      ...inventory,
      product_id: product.data.id,
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
