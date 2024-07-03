import { ProductCategory } from '@/types/primitives/ProductCategory';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createClient();

  const data = await req.json();

  const { error } = await supabase
    .from('inventory_units')
    .upsert(
      (data?.units || []).map((c: ProductCategory) => ({
        ...c,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating product units' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
