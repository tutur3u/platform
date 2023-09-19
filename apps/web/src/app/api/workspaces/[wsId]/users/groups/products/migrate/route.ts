import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Product } from '@/types/primitives/Product';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.json();

  const { error } = await supabase
    .from('user_group_linked_products')
    .upsert(
      (data?.products || []).map(({ id, ...u }: Product) => ({
        ...u,
      }))
    )
    .eq('product_id', data.product_id)
    .eq('group_id', data.group_id)
    .eq('unit_id', data.unit_id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating group products' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
