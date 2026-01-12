import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

interface ConsolidationResult {
  platform_user_id: string;
  ws_id: string;
  action: string;
}

/**
 * POST /api/v1/workspaces/[wsId]/consolidate-users
 *
 * Consolidates missing workspace_user_linked_users entries for the specified workspace.
 * Only workspace creators can execute this endpoint.
 *
 * Returns:
 * - 200: { repaired: number, results: Array<{ platform_user_id, ws_id, action }> }
 * - 401: Unauthorized
 * - 403: Forbidden (not workspace creator)
 * - 500: Internal server error
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedWsId = resolveWorkspaceId(wsId);

    // Check if user is the workspace creator (only creators can run this)
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('creator_id')
      .eq('id', resolvedWsId)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    if (workspace.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only workspace creators can consolidate users' },
        { status: 403 }
      );
    }

    // Run the consolidation RPC
    // Note: consolidate_workspace_user_links is defined in migration 20260112060000
    // Using type assertion since RPC types are generated after migration is applied
    const sbAdmin = await createAdminClient();
    const result = (await (sbAdmin.rpc as Function)(
      'consolidate_workspace_user_links',
      {
        target_ws_id: resolvedWsId,
      }
    )) as {
      data: ConsolidationResult[] | null;
      error: Error | null;
    };

    if (result.error) {
      console.error('[consolidate-users] RPC error:', result.error);
      return NextResponse.json(
        { error: 'Failed to consolidate users' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      repaired: result.data?.length || 0,
      results: result.data || [],
    });
  } catch (error) {
    console.error('[consolidate-users] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/workspaces/[wsId]/consolidate-users
 *
 * Returns the count of workspace members missing workspace_user_linked_users entries.
 * Useful for checking if consolidation is needed.
 *
 * Returns:
 * - 200: { missingCount: number, totalMembers: number }
 * - 401: Unauthorized
 * - 403: Forbidden (not workspace member)
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedWsId = resolveWorkspaceId(wsId);

    // Check if user is a workspace member
    const { data: membership, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', resolvedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: 'Not a workspace member' },
        { status: 403 }
      );
    }

    // Count total workspace members
    const { count: totalMembers } = await supabase
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', resolvedWsId);

    // Count members with linked users
    const { count: linkedCount } = await supabase
      .from('workspace_user_linked_users')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', resolvedWsId);

    const missingCount = (totalMembers || 0) - (linkedCount || 0);

    return NextResponse.json({
      missingCount,
      totalMembers: totalMembers || 0,
      linkedCount: linkedCount || 0,
    });
  } catch (error) {
    console.error('[consolidate-users] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
