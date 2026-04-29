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
import { z } from 'zod';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; channelId: string }> }
) {
  const { wsId, channelId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_chat_participants')
    .select('channel_id, user_id, last_read_at')
    .eq('channel_id', channelId);

  if (error) {
    return NextResponse.json(
      { message: 'Failed to load participants' },
      { status: 500 }
    );
  }

  return NextResponse.json({ participants: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; channelId: string }> }
) {
  const { wsId, channelId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const parsed = z
    .object({ last_read_at: z.string().datetime().optional() })
    .safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin.from('workspace_chat_participants').upsert(
    {
      channel_id: channelId,
      user_id: auth.user.id,
      last_read_at: parsed.data.last_read_at ?? new Date().toISOString(),
    },
    { onConflict: 'channel_id,user_id' }
  );

  if (error) {
    return NextResponse.json(
      { message: 'Failed to update participant' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
