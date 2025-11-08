import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId } = await params;
  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, apiKey })
    : getDataFromSession({ wsId });
}

async function getDataWithApiKey({
  wsId,
  apiKey,
}: {
  wsId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();

  const { data: apiKeyData, error: apiError } = await sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  if (apiError || !apiKeyData) {
    console.log(apiError);
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  // Use the regular client with API key to respect RLS and redaction
  const supabase = await createClient();

  // Use optimized aggregation function - calculates count at database level
  const { data: count, error } = await supabase.rpc(
    'get_wallet_expense_count',
    {
      p_ws_id: wsId,
    }
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error calculating expense count' },
      { status: 500 }
    );
  }

  return NextResponse.json(count ?? 0);
}

async function getDataFromSession({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  // Use optimized aggregation function - calculates count at database level
  const { data: count, error } = await supabase.rpc(
    'get_wallet_expense_count',
    {
      p_ws_id: wsId,
    }
  );

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error calculating expense count' },
      { status: 500 }
    );
  }

  return NextResponse.json(count ?? 0);
}
