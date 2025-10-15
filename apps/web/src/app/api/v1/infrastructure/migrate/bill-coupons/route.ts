import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  // finance_invoice_promotions has partial unique index on (invoice_id, code) WHERE both NOT NULL
  const data = json?.data || [];


  // Use upsert to make this migration idempotent
  // The unique constraint is on (invoice_id, code), so we can safely upsert
  // This handles both initial migration and re-runs without duplicates
  const { error } = await supabase
    .from('finance_invoice_promotions')
    .upsert(data, {
      onConflict: 'invoice_id,code',
      ignoreDuplicates: false, // Update existing records with new data
    });

  if (error) {
    console.log('Insert error:', error);
    return NextResponse.json(
      { message: 'Error migrating bill coupons', error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: 'success'
  });
}
