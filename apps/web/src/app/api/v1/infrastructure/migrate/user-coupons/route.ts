import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  const { error } = await supabase
    .from('user_linked_promotions')
    .upsert(json?.data || [], {
      onConflict: 'user_id,promo_id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating user coupons' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
