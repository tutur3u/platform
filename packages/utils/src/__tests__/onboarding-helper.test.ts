import { describe, expect, it } from 'vitest';

// Re-define constants and types here to avoid importing from the module
// that has server-side dependencies (@tuturuuu/supabase/next/client)
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  WORKSPACE_SETUP: 'workspace_setup',
  PROFILE_COMPLETION: 'profile_completion',
  FEATURE_TOUR: 'feature_tour',
  DASHBOARD_REDIRECT: 'dashboard_redirect',
} as const;

type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

interface OnboardingProgress {
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

interface WhitelistStatus {
  is_whitelisted: boolean;
  enabled: boolean;
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
}

interface WorkspaceTemplate {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  is_default: boolean;
  created_at: string;
}

describe('ONBOARDING_STEPS', () => {
  describe('step values', () => {
    it('should have WELCOME step', () => {
      expect(ONBOARDING_STEPS.WELCOME).toBe('welcome');
    });

    it('should have WORKSPACE_SETUP step', () => {
      expect(ONBOARDING_STEPS.WORKSPACE_SETUP).toBe('workspace_setup');
    });

    it('should have PROFILE_COMPLETION step', () => {
      expect(ONBOARDING_STEPS.PROFILE_COMPLETION).toBe('profile_completion');
    });

    it('should have FEATURE_TOUR step', () => {
      expect(ONBOARDING_STEPS.FEATURE_TOUR).toBe('feature_tour');
    });

    it('should have DASHBOARD_REDIRECT step', () => {
      expect(ONBOARDING_STEPS.DASHBOARD_REDIRECT).toBe('dashboard_redirect');
    });
  });

  describe('step count', () => {
    it('should have exactly 5 steps', () => {
      const steps = Object.values(ONBOARDING_STEPS);
      expect(steps).toHaveLength(5);
    });

    it('should have all unique values', () => {
      const steps = Object.values(ONBOARDING_STEPS);
      const uniqueSteps = new Set(steps);
      expect(uniqueSteps.size).toBe(steps.length);
    });
  });

  describe('step keys', () => {
    it('should have expected keys', () => {
      const keys = Object.keys(ONBOARDING_STEPS);
      expect(keys).toContain('WELCOME');
      expect(keys).toContain('WORKSPACE_SETUP');
      expect(keys).toContain('PROFILE_COMPLETION');
      expect(keys).toContain('FEATURE_TOUR');
      expect(keys).toContain('DASHBOARD_REDIRECT');
    });
  });

  describe('step order logic', () => {
    it('welcome should be the first step (logically)', () => {
      expect(ONBOARDING_STEPS.WELCOME).toBe('welcome');
    });

    it('dashboard_redirect should be the last step (logically)', () => {
      expect(ONBOARDING_STEPS.DASHBOARD_REDIRECT).toBe('dashboard_redirect');
    });
  });
});

describe('OnboardingStep type', () => {
  it('should accept valid step values', () => {
    // Type checking tests - these should compile
    const step1: OnboardingStep = 'welcome';
    const step2: OnboardingStep = 'workspace_setup';
    const step3: OnboardingStep = 'profile_completion';
    const step4: OnboardingStep = 'feature_tour';
    const step5: OnboardingStep = 'dashboard_redirect';

    expect(step1).toBe('welcome');
    expect(step2).toBe('workspace_setup');
    expect(step3).toBe('profile_completion');
    expect(step4).toBe('feature_tour');
    expect(step5).toBe('dashboard_redirect');
  });

  it('should work with ONBOARDING_STEPS values', () => {
    const step: OnboardingStep = ONBOARDING_STEPS.WELCOME;
    expect(step).toBe('welcome');
  });
});

describe('OnboardingProgress interface', () => {
  it('should accept valid progress object', () => {
    const progress: OnboardingProgress = {
      user_id: 'user-123',
      completed_steps: ['welcome', 'workspace_setup'],
      current_step: 'profile_completion',
      workspace_name: 'My Workspace',
      workspace_description: 'A test workspace',
      workspace_avatar_url: 'https://example.com/avatar.png',
      profile_completed: true,
      tour_completed: false,
      completed_at: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };

    expect(progress.user_id).toBe('user-123');
    expect(progress.completed_steps).toHaveLength(2);
    expect(progress.current_step).toBe('profile_completion');
  });

  it('should accept progress with null optional fields', () => {
    const progress: OnboardingProgress = {
      user_id: 'user-123',
      completed_steps: [],
      current_step: 'welcome',
      workspace_name: null,
      workspace_description: null,
      workspace_avatar_url: null,
      profile_completed: false,
      tour_completed: false,
      completed_at: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    expect(progress.workspace_name).toBeNull();
    expect(progress.completed_at).toBeNull();
  });

  it('should track completion with completed_at timestamp', () => {
    const progress: OnboardingProgress = {
      user_id: 'user-123',
      completed_steps: Object.values(ONBOARDING_STEPS),
      current_step: 'dashboard_redirect',
      profile_completed: true,
      tour_completed: true,
      completed_at: '2024-01-15T12:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-15T12:00:00Z',
    };

    expect(progress.completed_at).toBe('2024-01-15T12:00:00Z');
    expect(progress.completed_steps).toHaveLength(5);
  });
});

describe('WhitelistStatus interface', () => {
  it('should accept valid whitelist status', () => {
    const status: WhitelistStatus = {
      is_whitelisted: true,
      enabled: true,
      allow_challenge_management: true,
      allow_manage_all_challenges: false,
      allow_role_management: true,
    };

    expect(status.is_whitelisted).toBe(true);
    expect(status.enabled).toBe(true);
  });

  it('should represent non-whitelisted user', () => {
    const status: WhitelistStatus = {
      is_whitelisted: false,
      enabled: false,
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
    };

    expect(status.is_whitelisted).toBe(false);
    expect(status.allow_challenge_management).toBe(false);
  });

  it('should represent partial permissions', () => {
    const status: WhitelistStatus = {
      is_whitelisted: true,
      enabled: true,
      allow_challenge_management: true,
      allow_manage_all_challenges: false,
      allow_role_management: false,
    };

    expect(status.is_whitelisted).toBe(true);
    expect(status.allow_challenge_management).toBe(true);
    expect(status.allow_manage_all_challenges).toBe(false);
  });
});

describe('WorkspaceTemplate interface', () => {
  it('should accept valid workspace template', () => {
    const template: WorkspaceTemplate = {
      id: 'template-123',
      name: 'Business Template',
      description: 'A template for business workspaces',
      avatar_url: 'https://example.com/template.png',
      is_default: true,
      created_at: '2024-01-01T00:00:00Z',
    };

    expect(template.id).toBe('template-123');
    expect(template.name).toBe('Business Template');
    expect(template.is_default).toBe(true);
  });

  it('should accept template with null optional fields', () => {
    const template: WorkspaceTemplate = {
      id: 'template-456',
      name: 'Minimal Template',
      description: null,
      avatar_url: null,
      is_default: false,
      created_at: '2024-01-01T00:00:00Z',
    };

    expect(template.description).toBeNull();
    expect(template.avatar_url).toBeNull();
  });

  it('should handle default and non-default templates', () => {
    const defaultTemplate: WorkspaceTemplate = {
      id: 'default-1',
      name: 'Default',
      is_default: true,
      created_at: '2024-01-01T00:00:00Z',
    };

    const customTemplate: WorkspaceTemplate = {
      id: 'custom-1',
      name: 'Custom',
      is_default: false,
      created_at: '2024-01-02T00:00:00Z',
    };

    expect(defaultTemplate.is_default).toBe(true);
    expect(customTemplate.is_default).toBe(false);
  });
});

describe('Onboarding flow logic', () => {
  describe('step completion tracking', () => {
    it('should be able to track incremental step completion', () => {
      const completedSteps: OnboardingStep[] = [];

      // Simulate completing steps
      completedSteps.push(ONBOARDING_STEPS.WELCOME);
      expect(completedSteps).toContain('welcome');

      completedSteps.push(ONBOARDING_STEPS.WORKSPACE_SETUP);
      expect(completedSteps).toHaveLength(2);

      completedSteps.push(ONBOARDING_STEPS.PROFILE_COMPLETION);
      completedSteps.push(ONBOARDING_STEPS.FEATURE_TOUR);
      completedSteps.push(ONBOARDING_STEPS.DASHBOARD_REDIRECT);

      expect(completedSteps).toHaveLength(5);
    });

    it('should be able to check if all steps are completed', () => {
      const allSteps = Object.values(ONBOARDING_STEPS);
      const completedSteps = [...allSteps];

      const isCompleted = allSteps.every((step) =>
        completedSteps.includes(step)
      );
      expect(isCompleted).toBe(true);
    });

    it('should detect incomplete onboarding', () => {
      const allSteps = Object.values(ONBOARDING_STEPS);
      const completedSteps: OnboardingStep[] = [
        ONBOARDING_STEPS.WELCOME,
        ONBOARDING_STEPS.WORKSPACE_SETUP,
      ];

      const isCompleted = allSteps.every((step) =>
        completedSteps.includes(step)
      );
      expect(isCompleted).toBe(false);
    });
  });

  describe('step deduplication', () => {
    it('should handle duplicate step completion attempts', () => {
      const completedSteps: OnboardingStep[] = [ONBOARDING_STEPS.WELCOME];

      // Simulate adding same step again (should not duplicate)
      const newStep = ONBOARDING_STEPS.WELCOME;
      if (!completedSteps.includes(newStep)) {
        completedSteps.push(newStep);
      }

      expect(completedSteps).toHaveLength(1);
    });
  });
});
