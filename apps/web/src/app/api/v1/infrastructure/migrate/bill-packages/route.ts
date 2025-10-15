import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  const { error } = await supabase
    .from('finance_invoice_products')
    .upsert(json?.data || [], {
      onConflict: 'invoice_id,product_name,product_unit,warehouse',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error migrating bill packages' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
