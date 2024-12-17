import { createAdminClient, createClient } from '@/utils/supabase/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  if (!groupId)
    return NextResponse.json({ message: 'Invalid group ID' }, { status: 400 });

  if (!wsId)
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, groupId, apiKey })
    : getDataFromSession({ wsId, groupId });
}

async function getDataWithApiKey({
  wsId,
  groupId,
  apiKey,
}: {
  wsId: string;
  groupId: string;
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
    .from('workspace_user_groups_users')
    .select('count(), workspace_user_groups!inner(id, ws_id)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('workspace_user_groups.id', groupId)
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
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({
  wsId,
  groupId,
}: {
  wsId: string;
  groupId: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups_users')
    .select('count(), workspace_user_groups!inner(id, ws_id)')
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('workspace_user_groups.id', groupId)
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}
