import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string; configId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId } = await params;
  const supabase = await createClient(req);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('user_workspace_configs')
    .select('value')
    .eq('user_id', user.id)
    .eq('ws_id', wsId)
    .eq('id', configId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user workspace config:', error);
    return NextResponse.json(
      { message: 'Error fetching user workspace config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ value: data?.value ?? null });
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId: rawWsId, configId } = await params;
  const supabase = await createClient(req);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { message: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const bodySchema = z.object({
    value: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable(),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const { value } = parsedBody.data;

  if (value === null || value === '') {
    const { error } = await supabase
      .from('user_workspace_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .eq('id', configId);

    if (error) {
      console.error('Error deleting user workspace config:', error);
      return NextResponse.json(
        { message: 'Error deleting user workspace config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  }

  const { error } = await supabase.from('user_workspace_configs').upsert(
    {
      id: configId,
      user_id: user.id,
      ws_id: wsId,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,ws_id,id' }
  );

  if (error) {
    console.error('Error upserting user workspace config:', error);
    return NextResponse.json(
      { message: 'Error upserting user workspace config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
