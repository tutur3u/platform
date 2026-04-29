import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

async function requireWorkspaceUser(request: Request, wsId: string) {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase: supabase,
  });
  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }
  return { user, normalizedWsId };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; channelId: string }> }
) {
  const { wsId, channelId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_chat_typing_indicators')
    .upsert(
      {
        channel_id: channelId,
        user_id: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'channel_id,user_id' }
    );

  if (error) {
    return NextResponse.json(
      { message: 'Failed to update typing indicator' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string; channelId: string }> }
) {
  const { wsId, channelId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_chat_typing_indicators')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json(
      { message: 'Failed to clear typing indicator' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
