import { createClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

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
  const isValidApiKey = await validateWorkspaceApiKey(wsId, apiKey);

  if (!isValidApiKey) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  // Use the regular client with API key to respect RLS and redaction
  const supabase = await createClient();

  // Use optimized aggregation function - calculates sum at database level
  const { data: sum, error } = await supabase.rpc('get_wallet_income_sum', {
    p_ws_id: wsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error calculating income sum' },
      { status: 500 }
    );
  }

  return NextResponse.json(sum ?? 0);
}

async function getDataFromSession({ wsId }: { wsId: string }) {
  const supabase = await createClient();

  // Use optimized aggregation function - calculates sum at database level
  const { data: sum, error } = await supabase.rpc('get_wallet_income_sum', {
    p_ws_id: wsId,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error calculating income sum' },
      { status: 500 }
    );
  }

  return NextResponse.json(sum ?? 0);
}
