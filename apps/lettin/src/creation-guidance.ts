import type { LettinCreationGuidance } from '@tuturuuu/internal-api/lettin';
export const collaborationPreferences = [
  'unspecified',
  'ask-first',
  'open',
  'closed',
] as const satisfies readonly LettinCreationGuidance['collaboration'][];
