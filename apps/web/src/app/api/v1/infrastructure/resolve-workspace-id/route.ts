import { createClient } from '@tuturuuu/supabase/next/server';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { wsId } = await req.json();

    if (!wsId) {
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    // Handle "personal" workspace - needs database lookup
    if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Get user's personal workspace
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, workspace_members!inner(user_id)')
        .eq('personal', true)
        .eq('workspace_members.user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.error('Error fetching personal workspace:', error);
        return NextResponse.json(
          { error: 'Personal workspace not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ workspaceId: data.id });
    }

    // Handle other special workspace IDs (like "internal")
    const workspaceId = resolveWorkspaceId(wsId);

    return NextResponse.json({ workspaceId });
  } catch (error) {
    console.error('Error resolving workspace ID:', error);
    return NextResponse.json(
      { error: 'Failed to resolve workspace ID' },
      { status: 500 }
    );
  }
}
