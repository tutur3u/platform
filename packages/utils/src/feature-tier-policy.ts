import type { WorkspaceProductTier } from '@tuturuuu/types/db';
export const WORKSPACE_TIER_ORDER = [
  'FREE',
  'PLUS',
  'PRO',
  'MAX',
  'ULTRA',
  'ENTERPRISE',
] as const satisfies readonly WorkspaceProductTier[];

export const WORKSPACE_REALTIME_LIMITS = {
  FREE: { maxPresencePerBoard: 10 },
  PLUS: { maxPresencePerBoard: 50 },
  PRO: { maxPresencePerBoard: 50 },
  MAX: { maxPresencePerBoard: 75 },
  ULTRA: { maxPresencePerBoard: 100 },
  ENTERPRISE: { maxPresencePerBoard: 50 },
} as const satisfies Record<
  WorkspaceProductTier,
  { maxPresencePerBoard: number }
>;

export function workspaceTierRank(tier: string | null | undefined) {
  return WORKSPACE_TIER_ORDER.findIndex((entry) => entry === tier);
}

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

// The legacy Mira gate covers workspace-aware Mira. Explicit enrollment allows
// private Mira separately and leaves workspace-context access at Pro.
export const VERSIONED_FEATURE_TIERS = {
  ...FEATURE_TIERS,
  private_mira: 'FREE',
} as const satisfies Record<string, WorkspaceProductTier>;
