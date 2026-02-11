import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { NextResponse } from 'next/server';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all workspaces the user has access to
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select(
        'id, name, personal, avatar_url, logo_url, workspace_members!inner(user_id)'
      )
      .eq('workspace_members.user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching workspaces:', error);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    // Transform data
    const transformedWorkspaces = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      personal: ws.personal,
      avatar_url: ws.avatar_url,
      logo_url: ws.logo_url,
    }));

    return NextResponse.json(transformedWorkspaces);
  } catch (error) {
    console.error('Error in workspaces API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  // Check workspace creation limits
  const limitCheck = await checkWorkspaceCreationLimit(
    supabase,
    user.id,
    user.email
  );

  if (!limitCheck.canCreate) {
    const statusCode =
      limitCheck.errorCode === 'WORKSPACE_COUNT_ERROR' ? 500 : 403;
    return NextResponse.json(
      {
        message: limitCheck.errorMessage,
        code: limitCheck.errorCode,
      },
      { status: statusCode }
    );
  }

  const { name } = await req.json();

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name,
      creator_id: user.id,
    })
    .select('id')
    .single();

  console.log(data, error);

  if (error)
    return NextResponse.json(
      { message: 'Error creating workspace' },
      { status: 500 }
    );

  // Create Polar customer and free subscription for the new workspace
  try {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    // Get or create Polar customer
    await getOrCreatePolarCustomer({ polar, supabase, wsId: data.id });

    // Create free subscription for the workspace
    const subResult = await createFreeSubscription(polar, sbAdmin, data.id);

    if (subResult.status === 'created') {
      console.log(
        `Created free subscription ${subResult.subscription.id} for workspace ${data.id}`
      );
    } else {
      console.log(
        `Skipped free subscription creation for workspace ${data.id} (${subResult.status})`
      );
    }
  } catch (error) {
    // Log the error but don't fail workspace creation
    console.error('Error creating Polar subscription:', error);
    // Workspace creation succeeded, subscription creation is best-effort
  }

  return NextResponse.json({ message: 'success', id: data.id });
}
