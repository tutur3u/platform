import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

interface WorkspaceParams {
  wsId: string;
}

const TASK_ESTIMATES_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export const GET = withSessionAuth<WorkspaceParams>(
  async (_request, { supabase, user }, { wsId: rawWsId }) => {
    try {
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const workspaceMember = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (workspaceMember.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace membership' },
          { status: 500 }
        );
      }

      if (!workspaceMember.ok) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const sbAdmin = await createAdminClient();

      const { data: boards, error: boardsError } = await sbAdmin
        .from('workspace_boards')
        .select(
          'id, name, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, created_at'
        )
        .eq('ws_id', wsId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (boardsError) {
        console.error('Error fetching estimation boards:', boardsError);
        return NextResponse.json(
          { error: 'Failed to fetch boards' },
          { status: 500 }
        );
      }

      if (!boards?.length) {
        return NextResponse.json({ boards: [] });
      }

      return NextResponse.json({
        boards,
      });
    } catch (error) {
      console.error('Unexpected error fetching estimation boards:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_ESTIMATES_APP_SESSION_AUTH }
);
