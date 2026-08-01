import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ConnectedOnboardingProgress {
  completed_missions?: string[];
  dismissed_at?: string | null;
  goals?: string[];
  guidance_mode?: 'employee_test' | 'standard';
  journey_revision?: number;
  persona?: string | null;
  replay_app?: string | null;
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
