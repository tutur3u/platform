import type { PastCollapseChoice, PastMeetingPreference } from './types';

export const PAST_COLLAPSE_CONFIG = 'MEET_PAST_MEETINGS_COLLAPSE' as const;

export function pastCollapseChoice(value: unknown): PastCollapseChoice {
  return value === 'expanded' ? 'expanded' : 'collapsed';
}

export function pastPreference(
  accountId: string,
  workspaceId: string,
  value: unknown
): PastMeetingPreference {
  return {
    store: 'user-workspace-config',
    configId: PAST_COLLAPSE_CONFIG,
    accountId,
    workspaceId,
    choice: pastCollapseChoice(value),
  };
}
