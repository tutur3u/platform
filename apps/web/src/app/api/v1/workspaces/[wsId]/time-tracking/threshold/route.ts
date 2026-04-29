import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const UpdateThresholdSchema = z.object({
  threshold: z.union([z.number().int().nonnegative(), z.null()]).refine(
    (value) => {
      if (value === null) return true;
      // Ensure it's a valid integer (not a decimal that was coerced)
      return Number.isInteger(value) && value >= 0;
    },
    {
      message: 'Threshold must be a non-negative integer or null',
    }
  ),
  statusChangeGracePeriodMinutes: z.number().int().nonnegative().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  try {
    const { wsId } = await params;
    const supabase = await createClient(req);
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    } catch {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access and permissions
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const permissions = await getPermissions({
      wsId: normalizedWsId,
      request: req,
    });
    if (!permissions) {
      return NextResponse.json(
        { error: 'Failed to resolve permissions' },
        { status: 500 }
      );
    }
    const { withoutPermission } = permissions;

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
      .eq('id', normalizedWsId)
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

    // Validate request body using Zod schema
    const validationResult = UpdateThresholdSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error:
            'Invalid threshold value. Must be a non-negative integer or null.',
        },
        { status: 400 }
      );
    }

    const { threshold, statusChangeGracePeriodMinutes } = validationResult.data;
    const statusChangeGracePeriodForRpc =
      statusChangeGracePeriodMinutes ?? null;

    const { error: updateError } = await supabase.rpc(
      'update_time_tracking_threshold_settings',
      {
        p_ws_id: normalizedWsId,
        p_threshold: threshold ?? 0,
        p_no_approval_needed: threshold === null,
        p_status_change_grace_period_minutes:
          statusChangeGracePeriodForRpc as unknown as number,
      }
    );

    if (updateError) {
      console.error('Error updating threshold settings:', updateError);

      return NextResponse.json(
        { error: 'Failed to update threshold settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      threshold,
      statusChangeGracePeriodMinutes,
    });
  } catch (error) {
    console.error('Error in threshold API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
