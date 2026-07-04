import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function requirePostEmailQueueRootAdmin(request?: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: rootWorkspaceUser, error } = await supabase
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('platform_user_id', user.id)
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { message: 'Unable to verify root workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!rootWorkspaceUser) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { user };
}
