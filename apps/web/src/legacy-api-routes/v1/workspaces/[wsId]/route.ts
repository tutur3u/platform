import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { createErrorResponse, withApiAuth } from '@/lib/api-middleware';

interface Params {
  wsId: string;
}

/**
 * GET /api/v1/workspaces/[wsId]
 *
 * Returns workspace details for the authenticated workspace.
 * Requires valid API key with Bearer authentication.
 *
 * @returns Workspace name, id, and basic metadata
 */
export const GET = withApiAuth<Params>(
  async (_, { params, context }) => {
    const { wsId } = params;

    // Verify the requested workspace matches the API key's workspace
    if (context.wsId !== wsId) {
      return createErrorResponse(
        'Forbidden',
        'API key does not have access to this workspace',
        403,
        'WORKSPACE_MISMATCH'
      );
    }

    // Use admin client for SDK API routes (no user session cookies available)
    const supabase = await createDynamicAdminClient();

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, name, created_at')
      .eq('id', wsId)
      .single();

    if (error || !workspace) {
      return createErrorResponse(
        'Not Found',
        'Workspace not found',
        404,
        'WORKSPACE_NOT_FOUND'
      );
    }

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      created_at: workspace.created_at,
    });
  },
  {
    // No specific permissions required - just needs valid API key for the workspace
  }
);
