import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
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

  const apiCheckQuery = sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  const mainQuery = sbAdmin
    .from('wallet_transactions')
    .select('count(), workspace_wallets!inner(ws_id)')
    .eq('workspace_wallets.ws_id', wsId)
    .lt('amount', 0)
    .maybeSingle();

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  const { error: apiError } = apiCheck;

  if (apiError) {
    console.log(apiError);
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('count(), workspace_wallets!inner(ws_id)')
    .eq('workspace_wallets.ws_id', wsId)
    .lt('amount', 0)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}
