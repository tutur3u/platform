// Onboarding step definitions
export const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  USE_CASE: 'use_case',
  PROFILE: 'profile',
  TEAM_WORKSPACE: 'team_workspace',
  TEAM_INVITE: 'team_invite',
  PREFERENCES: 'preferences',
  CELEBRATION: 'celebration',
} as const;

export type OnboardingStep =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

// Use case options
export const USE_CASE_OPTIONS = {
  PERSONAL: 'personal',
  SMALL_TEAM: 'small_team',
  LARGE_TEAM: 'large_team',
  EXPLORING: 'exploring',
} as const;

export type UseCase = (typeof USE_CASE_OPTIONS)[keyof typeof USE_CASE_OPTIONS];

// Flow types
export const FLOW_TYPES = {
  PERSONAL: 'personal',
  TEAM: 'team',
} as const;

export type FlowType = (typeof FLOW_TYPES)[keyof typeof FLOW_TYPES];

// Steps for each flow type (PREFERENCES step removed for streamlined experience)
export const PERSONAL_FLOW_STEPS: OnboardingStep[] = [
  ONBOARDING_STEPS.WELCOME,
  ONBOARDING_STEPS.USE_CASE,
  ONBOARDING_STEPS.PROFILE,
  ONBOARDING_STEPS.CELEBRATION,
];

export const TEAM_FLOW_STEPS: OnboardingStep[] = [
  ONBOARDING_STEPS.WELCOME,
  ONBOARDING_STEPS.USE_CASE,
  ONBOARDING_STEPS.PROFILE,
  ONBOARDING_STEPS.TEAM_WORKSPACE,
  ONBOARDING_STEPS.TEAM_INVITE,
  ONBOARDING_STEPS.CELEBRATION,
];

// Get flow steps based on flow type
export function getFlowSteps(flowType: FlowType): OnboardingStep[] {
  return flowType === FLOW_TYPES.TEAM ? TEAM_FLOW_STEPS : PERSONAL_FLOW_STEPS;
}

// Determine flow type from use case selection
export function getFlowTypeFromUseCase(useCase: UseCase): FlowType {
  if (
    useCase === USE_CASE_OPTIONS.SMALL_TEAM ||
    useCase === USE_CASE_OPTIONS.LARGE_TEAM
  ) {
    return FLOW_TYPES.TEAM;
  }
  return FLOW_TYPES.PERSONAL;
}

// Get next step in flow
export function getNextStep(
  currentStep: OnboardingStep,
  flowType: FlowType
): OnboardingStep | null {
  const steps = getFlowSteps(flowType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === steps.length - 1) {
    return null;
  }
  return steps[currentIndex + 1] ?? null;
}

// Get previous step in flow
export function getPreviousStep(
  currentStep: OnboardingStep,
  flowType: FlowType
): OnboardingStep | null {
  const steps = getFlowSteps(flowType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return steps[currentIndex - 1] ?? null;
}

// Get step index (1-based for display)
export function getStepIndex(step: OnboardingStep, flowType: FlowType): number {
  const steps = getFlowSteps(flowType);
  return steps.indexOf(step) + 1;
}

// Get total steps count
export function getTotalSteps(flowType: FlowType): number {
  return getFlowSteps(flowType).length;
}

// Check if step is skippable
export function isStepSkippable(step: OnboardingStep): boolean {
  return (
    step === ONBOARDING_STEPS.TEAM_INVITE ||
    step === ONBOARDING_STEPS.PREFERENCES
  );
}

// Onboarding progress stored in database
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
  // New fields for adaptive flow
  use_case?: UseCase | null;
  flow_type: FlowType;
  invited_emails?: string[];
  theme_preference?: string | null;
  language_preference?: string | null;
  notifications_enabled: boolean;
  team_workspace_id?: string | null;
}

// Whitelist status from database
export interface WhitelistStatus {
  is_whitelisted: boolean;
  enabled: boolean;
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
}

// Profile data for profile step
export interface ProfileData {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
}

// Team workspace data
export interface TeamWorkspaceData {
  name: string;
  avatarUrl?: string;
}

// Preferences data
export interface PreferencesData {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notificationsEnabled: boolean;
}

// Step labels for progress indicator
export const STEP_LABELS: Record<OnboardingStep, string> = {
  [ONBOARDING_STEPS.WELCOME]: 'Welcome',
  [ONBOARDING_STEPS.USE_CASE]: 'Use Case',
  [ONBOARDING_STEPS.PROFILE]: 'Profile',
  [ONBOARDING_STEPS.TEAM_WORKSPACE]: 'Workspace',
  [ONBOARDING_STEPS.TEAM_INVITE]: 'Invite',
  [ONBOARDING_STEPS.PREFERENCES]: 'Preferences',
  [ONBOARDING_STEPS.CELEBRATION]: 'Done',
};
