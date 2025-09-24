import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId, userId } = await params;

  if (!userId)
    return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });

  if (!wsId)
    return NextResponse.json(
      { message: 'Invalid workspace ID' },
      { status: 400 }
    );

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, userId, apiKey })
    : getDataFromSession({ wsId, userId });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, userId } = await params;

  const data = await req.json();
  const { is_guest, ...userPayload } = data ?? {};

  const { error } = await supabase
    .from('workspace_users')
    .update(userPayload)
    .eq('ws_id', wsId)
    .eq('id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace user' },
      { status: 500 }
    );
  }

  // Sync guest membership based on is_guest flag when provided
  let warning: string | undefined;
  if (typeof is_guest === 'boolean') {
    const { data: guestGroup, error: groupError } = await supabase
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', wsId)
      .eq('is_guest', true)
      .maybeSingle();

    if (groupError) {
      console.log(groupError);
      warning = 'Failed to resolve guest group for this workspace.';
    } else if (!guestGroup?.id) {
      warning = 'No guest group found in this workspace.';
    } else {
      if (is_guest) {
        const { error: linkError } = await supabase
          .from('workspace_user_groups_users')
          .upsert(
            { group_id: guestGroup.id, user_id: userId },
            { onConflict: 'group_id,user_id' }
          );
        if (linkError) {
          console.log(linkError);
          warning = 'Failed to link user to guest group.';
        }
      } else {
        const { error: unlinkError } = await supabase
          .from('workspace_user_groups_users')
          .delete()
          .eq('group_id', guestGroup.id)
          .eq('user_id', userId);
        if (unlinkError) {
          console.log(unlinkError);
          warning = 'Failed to unlink user from guest group.';
        }
      }
    }
  }

  return NextResponse.json({ message: 'success', warning });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, userId } = await params;

  const { error } = await supabase
    .from('workspace_users')
    .delete()
    .eq('ws_id', wsId)
    .eq('id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

async function getDataWithApiKey({
  wsId,
  userId,
  apiKey,
}: {
  wsId: string;
  userId: string;
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
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', userId);

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

  return NextResponse.json(data);
}

async function getDataFromSession({
  wsId,
  userId,
}: {
  wsId: string;
  userId: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
