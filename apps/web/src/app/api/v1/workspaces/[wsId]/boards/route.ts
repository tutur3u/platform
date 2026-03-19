import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface WorkspaceParams {
  wsId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<WorkspaceParams> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view boards' },
        { status: 401 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    if (!validate(normalizedWsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: memberCheck, error: memberCheckError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberCheckError) {
      return NextResponse.json(
        {
          error: 'Failed to verify workspace access',
          details: memberCheckError.message,
        },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Fetch boards with their lists (exclude soft-deleted boards)
    const { data, error } = await sbAdmin
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
}
