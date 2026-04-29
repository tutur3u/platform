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
        { message: 'Failed to verify workspace access' },
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
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_chat_channels')
    .select('*')
    .eq('ws_id', auth.normalizedWsId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: 'Failed to load channels' },
      { status: 500 }
    );
  }

  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const auth = await requireWorkspaceUser(request, wsId);
  if ('error' in auth) return auth.error;

  const parsed = z
    .object({ name: z.string().trim().min(1).max(255) })
    .safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_chat_channels')
    .insert({
      ws_id: auth.normalizedWsId,
      name: parsed.data.name,
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { message: 'Failed to create channel' },
      { status: 500 }
    );
  }

  return NextResponse.json({ channel: data }, { status: 201 });
}
