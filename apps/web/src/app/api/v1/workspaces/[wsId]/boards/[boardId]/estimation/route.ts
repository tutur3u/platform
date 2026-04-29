import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

const estimationBodySchema = z.object({
  estimation_type: z
    .enum(['exponential', 'fibonacci', 'linear', 't-shirt'])
    .nullable(),
  extended_estimation: z.boolean().optional(),
  allow_zero_estimates: z.boolean().optional(),
  count_unestimated_issues: z.boolean().optional(),
});
const boardIdSchema = z.guid();

// PATCH - Update board estimation type
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: rawWsId, boardId: rawBoardId } = await params;
    const supabase = await createClient(request);

    let wsId: string;
    try {
      wsId = await normalizeWorkspaceId(rawWsId, supabase);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('user not authenticated')
      ) {
        return NextResponse.json(
          { error: 'User not authenticated' },
          { status: 401 }
        );
      }

      throw error;
    }

    const parsedBoardId = boardIdSchema.safeParse(rawBoardId);

    if (!parsedBoardId.success) {
      return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });
    }

    const boardId = parsedBoardId.data;
    const body = estimationBodySchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const {
      estimation_type,
      extended_estimation,
      allow_zero_estimates,
      count_unestimated_issues,
    } = body.data;

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
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

    // Verify the board exists and belongs to the workspace
    const sbAdmin = await createAdminClient();

    const { data: existingBoard } = await sbAdmin
      .from('workspace_boards')
      .select('id, ws_id')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (!existingBoard) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Update the board estimation type
    const updateData: Database['public']['Tables']['workspace_boards']['Update'] =
      {
        estimation_type: estimation_type,
      };

    // Only include extended_estimation if it's provided
    if (extended_estimation !== undefined) {
      updateData.extended_estimation = extended_estimation;
    }

    // Only include allow_zero_estimates if it's provided
    if (allow_zero_estimates !== undefined) {
      updateData.allow_zero_estimates = allow_zero_estimates;
    }

    // Only include count_unestimated_issues if it's provided
    if (count_unestimated_issues !== undefined) {
      updateData.count_unestimated_issues = count_unestimated_issues;
    }

    const { data: updatedBoard, error: updateError } = await sbAdmin
      .from('workspace_boards')
      .update(updateData)
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .select(
        'id, name, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, created_at'
      )
      .single();

    if (updateError) {
      console.error('Error updating board estimation type:', updateError);
      return NextResponse.json(
        { error: 'Failed to update estimation type' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedBoard);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
