import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface WorkspaceParams {
  wsId: string;
}

export const GET = withSessionAuth<WorkspaceParams>(
  async (_request: NextRequest, { supabase, user }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

      if (!validate(normalizedWsId)) {
        return NextResponse.json(
          { error: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      // Verify workspace access
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: normalizedWsId,
        userId: user.id,
        supabase: supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        serverLogger.error('Membership check error:', memberCheck.error);
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!memberCheck.ok) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });

      // Fetch boards with their lists (exclude soft-deleted boards)
      const { data, error } = await sbAdmin
        .from('workspace_boards')
        .select(
          `
        id,
        name,
        created_at,
        task_lists (
          id,
          name,
          status,
          color,
          position,
          deleted
        )
      `
        )
        .eq('ws_id', normalizedWsId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        serverLogger.error('Supabase error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch boards' },
          { status: 500 }
        );
      }

      return NextResponse.json({ boards: data });
    } catch (error) {
      serverLogger.error('Error fetching boards:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);
