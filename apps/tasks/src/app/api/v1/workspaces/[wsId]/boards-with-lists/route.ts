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

      // Fetch boards with their lists. Default-list columns are selected when
      // available but we fall back so boards still load while rollout settles.
      const withDefaultListQuery = sbAdmin
        .from('workspace_boards')
        .select(
          `
        id,
        name,
        created_at,
        default_list_id,
        default_done_list_id,
        default_closed_list_id,
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

      const primary = await (memberCheck.ok
        ? withDefaultListQuery
        : withDefaultListQuery.in('id', guestSummary.boardIds));

      let boards: Array<Record<string, unknown>> | null = primary.data;
      let error = primary.error;
      const primaryErrorMessage = error?.message ?? '';

      if (
        error &&
        (error.code === '42703' ||
          [
            'default_list_id',
            'default_done_list_id',
            'default_closed_list_id',
          ].some((column) => primaryErrorMessage.includes(column)))
      ) {
        const fallbackQuery = sbAdmin
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
          .eq('ws_id', wsId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        const fallback = await (memberCheck.ok
          ? fallbackQuery
          : fallbackQuery.in('id', guestSummary.boardIds));
        error = fallback.error;
        boards = fallback.data
          ? fallback.data.map((board) => ({
              ...board,
              default_list_id: null,
              default_done_list_id: null,
              default_closed_list_id: null,
            }))
          : null;
      }

      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch boards' },
          { status: 500 }
        );
      }

      return NextResponse.json({ boards });
    } catch (error) {
      console.error('Error fetching boards with lists:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] } }
);
