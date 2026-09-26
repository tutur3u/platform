import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function requirePostEmailQueueRootAdmin(request: Request) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: rootWorkspaceUser, error } = await actor.admin
    .from('workspace_user_linked_users')
    .select('platform_user_id')
    .eq('platform_user_id', actor.user.id)
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

  return { user: actor.user };
}
