import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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
  const { data: sum, error } = await supabase.rpc('get_wallet_expense_sum', {
    p_ws_id: wsId,
  });

  if (error) {
    console.error('Error calculating expense sum:', error);
    return NextResponse.json(
      { message: 'Error calculating expense sum' },
      { status: 500 }
    );
  }

  return NextResponse.json(sum ?? 0);
}

async function getDataFromSession({ wsId }: { wsId: string }) {
  const user = await getSatelliteAppSessionUser('finance');
  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const permissions = await getPermissions({ user, wsId });
  if (!permissions)
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const supabase = await createAdminClient({ noCookie: true });

  // Use optimized aggregation function - calculates sum at database level
  const { data: sum, error } = await supabase.rpc('get_wallet_expense_sum', {
    p_ws_id: permissions.wsId,
    p_user_id: user.id,
  });

  if (error) {
    console.error('Error calculating expense sum:', error);
    return NextResponse.json(
      { message: 'Error calculating expense sum' },
      { status: 500 }
    );
  }

  return NextResponse.json(sum ?? 0);
}
