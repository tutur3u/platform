import { createPolarClient } from '@tuturuuu/payment/polar/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreatePolarCustomer } from '@/utils/customer-session';
import { createFreeSubscription } from '@/utils/subscription-helper';

const CreateTeamWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  avatar_url: z.url().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate request body
  let body: z.infer<typeof CreateTeamWorkspaceSchema>;
  try {
    const rawBody = await req.json();
    body = CreateTeamWorkspaceSchema.parse(rawBody);
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
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

  // Create the team workspace (personal: false explicitly)
  const { data: workspace, error: createError } = await supabase
    .from('workspaces')
    .insert({
      name: body.name,
      avatar_url: body.avatar_url || null,
      personal: false,
    })
    .select('id, name')
    .single();

  if (createError || !workspace) {
    console.error('Error creating team workspace:', createError);
    return NextResponse.json(
      { message: 'Failed to create team workspace' },
      { status: 500 }
    );
  }

  // Update onboarding progress to link the team workspace
  const { error: progressError } = await supabase
    .from('onboarding_progress')
    .upsert(
      {
        user_id: user.id,
        team_workspace_id: workspace.id,
        workspace_name: body.name,
      },
      { onConflict: 'user_id' }
    );

  if (progressError) {
    console.error('Error updating onboarding progress:', progressError);
    // Don't fail the workspace creation for this
  }

  // Create Polar customer and free subscription for the new workspace
  try {
    const polar = createPolarClient();
    const sbAdmin = await createAdminClient();

    // Get or create Polar customer using user ID as external customer ID
    const customerId = await getOrCreatePolarCustomer({
      polar,
      supabase,
      wsId: workspace.id,
    });

    // Create free subscription for the workspace
    const subscription = await createFreeSubscription(
      polar,
      sbAdmin,
      customerId
    );

    if (subscription) {
      console.log(
        `Created free subscription ${subscription.id} for workspace ${workspace.id}`
      );
    } else {
      console.log(
        `Skipped free subscription creation for workspace ${workspace.id} (may already have active subscription)`
      );
    }
  } catch (error) {
    // Log the error but don't fail workspace creation
    console.error('Error creating Polar subscription:', error);
    // Workspace creation succeeded, subscription creation is best-effort
  }

  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
  });
}
