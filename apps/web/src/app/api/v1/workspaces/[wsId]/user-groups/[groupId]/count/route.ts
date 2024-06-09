import { createAdminClient } from '@/utils/supabase/client';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
    groupId: string;
  };
}

export async function GET(_: Request, { params: { wsId, groupId } }: Params) {
  const apiKey = headers().get('API_KEY');
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
  groupId: string | null;
  apiKey: string;
}) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );

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

  // @ts-expect-error: Supabase types don't support count() yet
  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({
  wsId,
  groupId,
}: {
  wsId: string;
  groupId: string | null;
}) {
  const supabase = createRouteHandlerClient({ cookies });

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

  // @ts-expect-error: Supabase types don't support count() yet
  return NextResponse.json(data?.count || 0);
}
