import { createClient } from '@tuturuuu/supabase/next/server';
import type { Product2 } from '@tuturuuu/types/primitives/Product';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    productId: string;
  }>;
}

export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = (await req.json()) as Product2;
  const { productId } = await params;

  const product = await supabase
    .from('workspace_products')
    .update({
      ...data,
    })
    .eq('id', productId);

  if (product.error) {
    console.log(product.error);
    return NextResponse.json(
      { message: 'Error creating product' },
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
