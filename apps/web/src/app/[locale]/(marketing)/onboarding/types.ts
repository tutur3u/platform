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

export const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  WORKSPACE_SETUP: 'workspace_setup',
  PROFILE_COMPLETION: 'profile_completion',
  DASHBOARD_REDIRECT: 'dashboard_redirect',
} as const;

export type OnboardingStep =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];
