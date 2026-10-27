import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { wsId } = await params;
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const permissions = await getPermissions({ wsId, request });
  if (!permissions?.containsPermission('view_users_private_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('email')
    .eq('ws_id', wsId);

  if (error) {
    console.error('Error getting users', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const email = data?.map((email) => email.email) || [];

  return NextResponse.json({ email }, { status: 200 });
}
