import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access and permissions
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { withoutPermission } = await getPermissions({ wsId });

    if (
      withoutPermission('manage_workspace_settings') ||
      withoutPermission('manage_time_tracking_requests')
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions to modify time tracking settings' },
        { status: 403 }
      );
    }

    // Check if workspace is personal - threshold settings are not allowed for personal workspaces
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();

    if (workspace?.personal) {
      return NextResponse.json(
        {
          error:
            'Time tracking threshold settings are not available for personal workspaces',
        },
        { status: 400 }
      );
    }

    // Parse and validate the threshold value
    const body = await req.json();
    const rawThreshold = body.threshold;

    // Allow null to clear the threshold (means no approval needed)
    let threshold: number | null = null;
    if (rawThreshold !== null && rawThreshold !== undefined) {
      threshold = Number.parseInt(rawThreshold, 10);

      if (Number.isNaN(threshold) || threshold < 0) {
        return NextResponse.json(
          { error: 'Invalid threshold value. Must be a non-negative integer or null.' },
          { status: 400 }
        );
      }
    }

    // Update workspace settings
    const { error: updateError } = await supabase
      .from('workspace_settings')
      .upsert(
        {
          ws_id: wsId,
          missed_entry_date_threshold: threshold,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'ws_id',
        }
      );

    if (updateError) {
      console.error('Error updating threshold:', updateError);
      return NextResponse.json(
        { error: 'Failed to update threshold setting' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      threshold,
    });
  } catch (error) {
    console.error('Error in threshold API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
