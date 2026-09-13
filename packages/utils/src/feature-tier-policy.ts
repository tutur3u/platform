import type { WorkspaceProductTier } from '@tuturuuu/types/db';
export const FEATURE_TIERS = {
  // FREE tier features
  dashboard: 'FREE',
  tasks: 'FREE',
  calendar: 'FREE',
  notifications: 'FREE',
  qr_generator: 'FREE',
  finance: 'FREE',
  users: 'FREE',
  inventory: 'FREE',
  whiteboards: 'FREE',
  drive: 'FREE',
  realtime_cursors: 'FREE',
  documents: 'FREE',
  time_tracker: 'FREE',
  voice_assistant: 'FREE',

  // PLUS tier features
  chat: 'PLUS',

  // PRO tier features
  workforce: 'PRO',
  ai_lab: 'PRO',
  mira: 'PRO',
} as const satisfies Record<string, WorkspaceProductTier>;
