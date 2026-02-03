import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { NextResponse } from 'next/server';
import { createPolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Check if user already has a personal workspace
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (existingPersonal) {
    // Return existing workspace ID instead of error - this supports idempotent onboarding
    return NextResponse.json({ id: existingPersonal.id, existing: true });
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

  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: 'PERSONAL',
      personal: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Failed to create personal workspace' },
      { status: 500 }
    );
  }

  // Create Polar customer and free subscription for the new workspace
  try {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    // Get or create Polar customer using workspace ID as external customer ID
    await createPolarCustomer({
      polar,
      supabase,
      wsId: data.id,
    });

    // Create free subscription for the workspace
    const subscription = await createFreeSubscription(polar, sbAdmin, data.id);

    if (subscription) {
      console.log(
        `Created free subscription ${subscription.id} for workspace ${data.id}`
      );
    } else {
      console.log(
        `Skipped free subscription creation for workspace ${data.id} (may already have active subscription)`
      );
    }
  } catch (error) {
    // Log the error but don't fail workspace creation
    console.error('Error creating Polar subscription:', error);
    // Workspace creation succeeded, subscription creation is best-effort
  }

  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { workspaceId } = await req.json();
  if (!workspaceId)
    return NextResponse.json(
      { message: 'workspaceId is required' },
      { status: 400 }
    );

  // Ensure the workspace is owned by the user and has only 1 member
  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .select('id, creator_id, workspace_members(count)')
    .eq('id', workspaceId)
    .single();

  if (wsError || !ws)
    return NextResponse.json(
      { message: 'Workspace not found' },
      { status: 404 }
    );
  if (ws.creator_id !== user.id)
    return NextResponse.json(
      { message: 'Must be the creator' },
      { status: 403 }
    );

  const memberCount = ws.workspace_members?.[0]?.count as number | undefined;
  if (!memberCount || memberCount !== 1)
    return NextResponse.json(
      { message: 'Workspace must have exactly 1 member' },
      { status: 400 }
    );

  // Ensure user has no other personal workspace
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (existingPersonal)
    return NextResponse.json(
      { message: 'Already has personal workspace' },
      { status: 400 }
    );

  const { error } = await supabase
    .from('workspaces')
    .update({ personal: true })
    .eq('id', workspaceId);
  if (error)
    return NextResponse.json(
      { message: 'Failed to mark personal workspace' },
      { status: 500 }
    );

  return NextResponse.json({ id: workspaceId });
}
