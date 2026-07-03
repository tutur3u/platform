import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { assertWorkspaceApiKeysAccess } from '../shared';

interface RouteParams {
  wsId: string;
}

export const GET = withSessionAuth<RouteParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const { data, error } = await supabase
        .from('workspace_roles')
        .select('id, name')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching workspace API key roles:', error);
        return NextResponse.json(
          { message: 'Error fetching workspace roles' },
          { status: 500 }
        );
      }

      return NextResponse.json({ data: data ?? [] });
    } catch (error) {
      console.error('Error in GET workspace API key roles:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
