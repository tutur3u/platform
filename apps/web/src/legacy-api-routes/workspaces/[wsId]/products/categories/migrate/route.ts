import { createClient } from '@tuturuuu/supabase/next/server';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId } = await params;

  const { error } = await supabase
    .from('product_categories')
    .upsert(
      (data?.categories || []).map((c: ProductCategory) => ({
        ...c,
        ws_id: wsId,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating product categories' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
