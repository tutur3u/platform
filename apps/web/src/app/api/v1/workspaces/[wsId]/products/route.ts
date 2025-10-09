import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import type { ProductInventory } from '@tuturuuu/types/primitives/ProductInventory';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('create_inventory')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create products' },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { inventory, ...data } = (await req.json()) as Product2 & {
    inventory: ProductInventory[];
  };

  const product = await supabase
    .from('workspace_products')
    .insert({
      ...data,
      ws_id: wsId,
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

  const { error } = await supabase.from('inventory_products').insert(
    inventory.map((inventory) => ({
      ...inventory,
      product_id: product.data.id,
    }))
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating inventory' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
