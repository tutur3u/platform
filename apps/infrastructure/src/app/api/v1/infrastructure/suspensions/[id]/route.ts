import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { liftSuspension } from '@tuturuuu/utils/abuse-protection/user-suspension';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export const DELETE = withSessionAuth<{ id: string }>(
  async (req, _context, { id }) => {
    const actor = await resolveSatelliteRequestActor(req, 'infra');
    if (!actor)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { user, admin: supabase } = actor;
    const { data: hasPermission } = await supabase.rpc(
      'has_workspace_permission',
      {
        p_ws_id: ROOT_WORKSPACE_ID,
        p_user_id: user.id,
        p_permission: 'manage_workspace_roles',
      }
    );

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const success = await liftSuspension(id, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to lift suspension' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Suspension lifted' });
  },
  { allowAppSessionAuth: { targetApp: 'infra' } }
);
