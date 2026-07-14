import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  loadTaskBoardGuestSharesForWorkspace,
  summarizeTaskBoardGuestShares,
} from '@tuturuuu/tasks-api/server/board-access';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { withSessionAuth } from '@/lib/api-auth';

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
        console.error('Membership check error:', memberCheck.error);
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      const sbAdmin = await createAdminClient({ noCookie: true });
      const guestShares = memberCheck.ok
        ? []
        : await loadTaskBoardGuestSharesForWorkspace({
            sbAdmin,
            user,
            workspaceId: normalizedWsId,
          });
      const guestSummary = summarizeTaskBoardGuestShares(guestShares);

      if (!memberCheck.ok && guestSummary.boardCount === 0) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

      // Fetch boards with their lists (exclude soft-deleted boards)
      let query = sbAdmin
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

      if (!memberCheck.ok) {
        query = query.in('id', guestSummary.boardIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch boards' },
          { status: 500 }
        );
      }

      return NextResponse.json({ boards: data });
    } catch (error) {
      console.error('Error fetching boards:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);
