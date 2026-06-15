import {
  loadTaskBoardGuestSharesForWorkspace,
  summarizeTaskBoardGuestShares,
} from '@tuturuuu/apis/tu-do/board-access';
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
  async (_request: NextRequest, { supabase, user }, { wsId: rawWsId }) => {
    try {
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      if (!validate(wsId)) {
        return NextResponse.json(
          { error: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      // Verify workspace access
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          {
            error: 'Failed to verify workspace access',
            details: memberCheck.error,
          },
          { status: 500 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const guestShares = memberCheck.ok
        ? []
        : await loadTaskBoardGuestSharesForWorkspace({
            sbAdmin,
            user,
            workspaceId: wsId,
          });
      const guestSummary = summarizeTaskBoardGuestShares(guestShares);

      if (!memberCheck.ok && guestSummary.boardCount === 0) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

      // Fetch boards with their lists
      let query = sbAdmin
        .from('workspace_boards')
        .select(
          `
        id,
        name,
        created_at,
        default_list_id,
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
        .eq('ws_id', wsId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!memberCheck.ok) {
        query = query.in('id', guestSummary.boardIds);
      }

      const { data, error } = await query;

      if (error) {
        serverLogger.error('Supabase error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch boards' },
          { status: 500 }
        );
      }

      return NextResponse.json({ boards: data });
    } catch (error) {
      serverLogger.error('Error fetching boards with lists:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);
