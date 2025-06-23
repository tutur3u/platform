import { createClient } from '@tuturuuu/supabase/next/client';

export interface OnboardingProgress {
  user_id: string;
  completed_steps: string[];
  current_step: string;
  workspace_name?: string | null;
  workspace_description?: string | null;
  workspace_avatar_url?: string | null;
  profile_completed: boolean;
  tour_completed: boolean;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhitelistStatus {
  is_whitelisted: boolean;
  enabled: boolean;
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  is_default: boolean;
  created_at: string;
}

export const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  WORKSPACE_SETUP: 'workspace_setup',
  PROFILE_COMPLETION: 'profile_completion',
  FEATURE_TOUR: 'feature_tour',
  DASHBOARD_REDIRECT: 'dashboard_redirect',
} as const;

export type OnboardingStep =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

/**
 * Check if a user is whitelisted to access the platform
 */
export async function checkUserWhitelistStatus(
  userId: string
): Promise<WhitelistStatus> {
  const supabase = createClient();

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
  const supabase = createClient();

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
  const supabase = createClient();

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
): Promise<boolean> {
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
  return !!result;
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
  const supabase = createClient();

  try {
    // Create the workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        description: workspaceDescription,
        avatar_url: avatarUrl,
        creator_id: userId,
      })
      .select('id')
      .single();

    if (workspaceError) {
      return { success: false, error: workspaceError.message };
    }

    // Set as user's default workspace
    const { error: updateError } = await supabase
      .from('user_private_details')
      .update({ default_workspace_id: workspace.id })
      .eq('user_id', userId);

    if (updateError) {
      console.warn('Could not set default workspace:', updateError);
    }

    return { success: true, workspaceId: workspace.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
