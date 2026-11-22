import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ConnectedOnboardingProgress {
  /** Set when the welcome flow reaches its last screen. */
  completed_at?: string | null;
  completed_missions?: string[];
  completed_steps?: string[];
  current_step?: string;
  /** Set when the person skips the whole welcome flow. */
  dismissed_at?: string | null;
  goals?: string[];
  guidance_mode?: 'employee_test' | 'standard';
  journey_revision?: number;
  language_preference?: string | null;
  persona?: string | null;
  replay_app?: string | null;
  team_workspace_id?: string | null;
  theme_preference?: string | null;
}

export type ConnectedOnboardingUpdate = Partial<ConnectedOnboardingProgress>;

const PROGRESS_PATH = '/api/v1/user/onboarding-progress';

export function getConnectedOnboardingProgress(
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ConnectedOnboardingProgress | null>(
    PROGRESS_PATH,
    { cache: 'no-store' }
  );
}

export function updateConnectedOnboardingProgress(
  payload: ConnectedOnboardingUpdate,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ConnectedOnboardingProgress>(
    PROGRESS_PATH,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}
