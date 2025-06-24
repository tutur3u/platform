'use server';

import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import type {
  OnboardingProgress,
  OnboardingStep,
  WhitelistStatus,
} from './types';
import { ONBOARDING_STEPS } from './types';

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

  return data;
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

  return data;
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

  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  const updates: Partial<OnboardingProgress> = {
    completed_steps: completedSteps,
    current_step: nextStep || step,
  };

  // Check if all steps are completed
  const allSteps = Object.values(ONBOARDING_STEPS);
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
 * Create workspace from onboarding data
 */
export async function createWorkspaceFromOnboarding(
  userId: string,
  workspaceName: string,
  workspaceDescription?: string,
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

    // First, create the workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        description: workspaceDescription,
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
        role: 'ADMIN',
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
  await completeOnboardingStep(userId, ONBOARDING_STEPS.DASHBOARD_REDIRECT);

  // Redirect to the workspace dashboard
  redirect(`/${workspaceId}`);
}
