import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Product } from '@/types/primitives/Product';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function PUT(req: Request, { params: { wsId: id } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('workspace_products')
    .upsert(
      (data?.products || []).map((p: Product) => ({
        ...p,
        ws_id: id,
      }))
    )
    .eq('id', data.id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating workspace products' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
