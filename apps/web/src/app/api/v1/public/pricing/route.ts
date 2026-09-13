import {
  PUBLIC_WORKSPACE_PRODUCT_IDS,
  publicWorkspacePrices,
} from '@tuturuuu/payment-core/public-prices';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';

export async function GET() {
  await connection();
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .schema('private')
      .from('workspace_subscription_products')
      .select(
        'id,tier,archived,pricing_model,price_per_seat,recurring_interval'
      )
      .in('id', PUBLIC_WORKSPACE_PRODUCT_IDS);
    if (error || !data) throw new Error('Catalog read unavailable');
    return NextResponse.json(publicWorkspacePrices(data), {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Pricing is temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
