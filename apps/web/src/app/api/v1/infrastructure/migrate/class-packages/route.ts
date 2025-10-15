import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  // user_group_linked_products has no primary key but has unique combination
  // Use group_id + product_id + unit_id as the conflict target
  const { error } = await supabase
    .from('user_group_linked_products')
    .upsert(json?.data || [], {
      onConflict: 'group_id,product_id,unit_id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating class packages' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
