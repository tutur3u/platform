import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(_: Request) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('ai_gateway_models')
    .select(
      'id, name, provider, description, context_window, max_tokens, tags, input_price_per_token, output_price_per_token, type, is_enabled'
    )
    .eq('type', 'language')
    .order('provider')
    .order('name');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
