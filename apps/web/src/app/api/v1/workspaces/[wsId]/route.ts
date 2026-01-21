import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/api-middleware';

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
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'API key does not have access to this workspace',
        },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, name, created_at')
      .eq('id', wsId)
      .single();

    if (error || !workspace) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Workspace not found' },
        { status: 404 }
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
