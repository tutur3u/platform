import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_WORKSPACE_NAME_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(MAX_WORKSPACE_NAME_LENGTH),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: id } = await params;

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await normalizeWorkspaceId(id, supabase);

  const { data, error } = await supabase
    .from('workspaces')
    .select('*, workspace_members!inner(user_id)')
    .eq('id', wsId)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.user_id)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  const { workspace_members: workspaceMembers, ...workspaceData } = data;

  void workspaceMembers;

  return NextResponse.json(workspaceData, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
    },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: id } = await params;

  try {
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, personal, workspace_members!inner(user_id)')
      .eq('id', wsId)
      .eq('workspace_members.user_id', user.id)
      .maybeSingle();

    if (workspaceError) {
      return NextResponse.json(
        { message: 'Error verifying workspace access' },
        { status: 500 }
      );
    }

    if (!workspace) {
      return NextResponse.json(
        { message: 'Workspace access denied' },
        { status: 403 }
      );
    }

    if (!workspace.personal) {
      const permissions = await getPermissions({ wsId, request: req });

      if (!permissions?.containsPermission('manage_workspace_settings')) {
        return NextResponse.json(
          { message: 'Insufficient permissions to update workspace' },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const { name } = UpdateWorkspaceSchema.parse(body);

    const { data, error } = await supabase
      .from('workspaces')
      .update({
        name,
      })
      .select('id')
      .eq('id', wsId);

    if (error)
      return NextResponse.json(
        { message: 'Error updating workspace' },
        { status: 500 }
      );

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'success' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Error updating workspace' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId: id } = await params;

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const wsId = await normalizeWorkspaceId(id, supabase);

  // Block deletion of personal workspaces
  const { data: wsData } = await supabase
    .from('workspaces')
    .select('personal')
    .eq('id', wsId)
    .single();

  if (wsData?.personal) {
    return NextResponse.json(
      { message: 'Personal workspaces cannot be manually deleted.' },
      { status: 403 }
    );
  }

  // Check for active subscription to cancel immediately
  try {
    const { data: subscription, error: subError } = await supabase
      .from('workspace_subscriptions')
      .select('polar_subscription_id')
      .eq('ws_id', wsId)
      .neq('status', 'canceled')
      .maybeSingle();

    if (subError) throw subError;

    if (subscription?.polar_subscription_id) {
      const polar = createPolarClient();
      await polar.subscriptions.revoke({
        id: subscription.polar_subscription_id,
      });
      console.log(
        `Revoked Polar subscription ${subscription.polar_subscription_id} for workspace ${wsId}`
      );
    }
  } catch (error) {
    console.error('Failed to revoke Polar subscription:', error);
    // Continue with workspace deletion even if subscription cancellation fails
  }

  const { error } = await supabase.from('workspaces').delete().eq('id', wsId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
