import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
  const supabase = await createClient();

  const json = await req.json();

  // finance_invoice_promotions has partial unique index on (invoice_id, code) WHERE both NOT NULL
  const data = json?.data || [];
  
  // Deduplicate incoming data first: keep only unique (invoice_id, code) combinations
  const deduplicatedData = Array.from(
    new Map(
      data
        .filter((d: any) => d.invoice_id && d.code) // Only process records with both invoice_id and code
        .map((d: any) => [`${d.invoice_id}:${d.code}`, d])
    ).values()
  ) as Array<{ invoice_id: string; code: string; [key: string]: any }>;
  
  // Only process if we have deduplicated data
  if (deduplicatedData.length === 0) {
    return NextResponse.json({ message: 'success', inserted: 0 });
  }

  // Collect all unique invoice_ids to delete in batch
  const invoiceIds = [...new Set(deduplicatedData.map(d => d.invoice_id))];
  
  // Delete all existing records for these invoices first
  // This clears the slate before inserting the new data
  if (invoiceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('finance_invoice_promotions')
      .delete()
      .in('invoice_id', invoiceIds);
    
    if (deleteError) {
      console.log('Delete error:', deleteError);
      // Continue anyway - the error might be "no rows found"
    }
  }

  // Now insert all the deduplicated data
  const { error } = await supabase
    .from('finance_invoice_promotions')
    .insert(deduplicatedData);

  if (error) {
    console.log('Insert error:', error);
    return NextResponse.json(
      { message: 'Error migrating bill coupons', error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ 
    message: 'success', 
    inserted: deduplicatedData.length,
    deduplicated: data.length - deduplicatedData.length
  });
}
