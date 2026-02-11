'use server';

import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { checkWorkspaceCreationLimit } from '@tuturuuu/utils/workspace-limits';
import { redirect } from 'next/navigation';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';
import type {
  FlowType,
  OnboardingProgress,
  OnboardingStep,
  UseCase,
  WhitelistStatus,
} from './types';
import { FLOW_TYPES, getFlowSteps, ONBOARDING_STEPS } from './types';

/**
 * Check if a user is whitelisted to access the platform
 */
export async function checkUserWhitelistStatus(
  userId: string
): Promise<WhitelistStatus> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('get_user_whitelist_status', { user_id_param: userId })
    .single();

  if (error) {
    console.error('Error checking whitelist status:', error);
    return {
      is_whitelisted: false,
      enabled: false,
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
    };
  }

  return data;
}

/**
 * Get user's onboarding progress
 */
export async function getUserOnboardingProgress(
  userId: string
): Promise<OnboardingProgress | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No record found, return null
      return null;
    }
    console.error('Error fetching onboarding progress:', error);
    return null;
  }

  // Ensure flow_type has a default value and cast types properly
  return {
    ...data,
    use_case: data.use_case as UseCase | null | undefined,
    flow_type: (data.flow_type || FLOW_TYPES.PERSONAL) as FlowType,
    invited_emails: data.invited_emails ?? undefined,
    notifications_enabled: data.notifications_enabled ?? true,
  };
}

/**
 * Create or update user's onboarding progress
 */
export async function updateOnboardingProgress(
  userId: string,
  updates: Partial<
    Omit<OnboardingProgress, 'user_id' | 'created_at' | 'updated_at'>
  >
): Promise<OnboardingProgress | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert(
      {
        user_id: userId,
        ...updates,
      },
      {
        onConflict: 'user_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error updating onboarding progress:', error);
    return null;
  }

  // Cast types properly
  return {
    ...data,
    use_case: data.use_case as UseCase | null | undefined,
    flow_type: (data.flow_type || FLOW_TYPES.PERSONAL) as FlowType,
    invited_emails: data.invited_emails ?? undefined,
    notifications_enabled: data.notifications_enabled ?? true,
  };
}

/**
 * Mark an onboarding step as completed
 */
export async function completeOnboardingStep(
  userId: string,
  step: OnboardingStep,
  nextStep?: OnboardingStep
): Promise<{ success: boolean; progress?: OnboardingProgress }> {
  const progress = await getUserOnboardingProgress(userId);
  const completedSteps = progress?.completed_steps || [];
  const flowType = (progress?.flow_type || FLOW_TYPES.PERSONAL) as FlowType;

  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  const updates: Partial<OnboardingProgress> = {
    completed_steps: completedSteps,
    current_step: nextStep || step,
  };

  // Check if all steps for the current flow are completed
  const allSteps = getFlowSteps(flowType);
  const isCompleted = allSteps.every((s) => completedSteps.includes(s));

  if (isCompleted) {
    updates.completed_at = new Date().toISOString();
  }

  const result = await updateOnboardingProgress(userId, updates);
  return { success: !!result, progress: result || undefined };
}

/**
 * Check if user has completed onboarding
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const progress = await getUserOnboardingProgress(userId);
  return !!progress?.completed_at;
}

/**
 * Set the use case and determine flow type
 */
export async function setOnboardingUseCase(
  userId: string,
  useCase: UseCase
): Promise<{ success: boolean; flowType: FlowType }> {
  const flowType: FlowType =
    useCase === 'small_team' || useCase === 'large_team'
      ? FLOW_TYPES.TEAM
      : FLOW_TYPES.PERSONAL;

  const result = await updateOnboardingProgress(userId, {
    use_case: useCase,
    flow_type: flowType,
    current_step: ONBOARDING_STEPS.PROFILE,
  });

  return { success: !!result, flowType };
}

/**
 * Create workspace from onboarding data
 */
export async function createWorkspaceFromOnboarding(
  userId: string,
  workspaceName: string,
  avatarUrl?: string
): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get the current authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id || user.id !== userId) {
      return { success: false, error: 'Authentication error' };
    }

    // Check workspace creation limits
    const limitCheck = await checkWorkspaceCreationLimit(
      supabase,
      user.id,
      user.email
    );

    if (!limitCheck.canCreate) {
      return {
        success: false,
        error: limitCheck.errorMessage,
      };
    }

    // First, create the workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        avatar_url: avatarUrl,
      })
      .select('id')
      .single();

    if (workspaceError || !workspace) {
      console.error('Error creating workspace:', workspaceError);
      return { success: false, error: 'Failed to create workspace' };
    }

    // Add the user as a workspace member with admin role
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        ws_id: workspace.id,
        user_id: userId,
      });

    if (memberError) {
      console.error('Error adding user as workspace member:', memberError);
      // Try to clean up the workspace if adding member failed
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: 'Failed to add user to workspace' };
    }

    // Update user's default workspace
    const { error: userUpdateError } = await supabase
      .from('user_private_details')
      .update({ default_workspace_id: workspace.id })
      .eq('user_id', userId);

    if (userUpdateError) {
      console.error('Error updating user default workspace:', userUpdateError);
      // Don't fail the entire operation for this
    }

    // Create Polar customer and free subscription for the new workspace
    try {
      const polar = createPolarClient();
      const sbAdmin = await createAdminClient();

      // Get or create Polar customer
      await getOrCreatePolarCustomer({
        polar,
        supabase: sbAdmin,
        wsId: workspace.id,
      });

      // Create free subscription for the workspace
      const subResult = await createFreeSubscription(
        polar,
        sbAdmin,
        workspace.id
      );

      if (subResult.status === 'created') {
        console.log(
          `Created free subscription ${subResult.subscription.id} for workspace ${workspace.id}`
        );
      } else {
        console.log(
          `Skipped free subscription creation for workspace ${workspace.id} (${subResult.status})`
        );
      }
    } catch (error) {
      // Log the error but don't fail workspace creation
      console.error('Error creating Polar subscription:', error);
      // Workspace creation succeeded, subscription creation is best-effort
    }

    return { success: true, workspaceId: workspace.id };
  } catch (error) {
    console.error('Error in createWorkspaceFromOnboarding:', error);
    return { success: false, error: 'Unexpected error occurred' };
  }
}

/**
 * Complete onboarding and redirect to dashboard
 */
export async function completeOnboardingAndRedirect(
  userId: string,
  workspaceId: string
) {
  // Mark onboarding as completed
  await completeOnboardingStep(userId, ONBOARDING_STEPS.CELEBRATION);

  // Redirect to the workspace dashboard
  redirect(`/${workspaceId}`);
}
