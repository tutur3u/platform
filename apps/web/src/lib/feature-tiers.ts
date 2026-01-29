import type { WorkspaceProductTier } from '@tuturuuu/types/db';

/**
 * Tier hierarchy for comparison (higher index = higher tier)
 */
export const TIER_HIERARCHY: readonly WorkspaceProductTier[] = [
  'FREE',
  'PLUS',
  'PRO',
  'ENTERPRISE',
] as const;

/**
 * Feature identifiers for the platform
 */
export type FeatureId =
  | 'dashboard'
  | 'tasks'
  | 'calendar'
  | 'notifications'
  | 'qr_generator'
  | 'documents'
  | 'whiteboards'
  | 'chat'
  | 'time_tracker'
  | 'finance'
  | 'users'
  | 'drive'
  | 'inventory'
  | 'ai_lab'
  | 'voice_assistant'
  | 'workforce'
  | 'tuna';

/**
 * Feature tier requirements configuration
 */
export const FEATURE_TIERS: Record<FeatureId, WorkspaceProductTier> = {
  // FREE tier features
  dashboard: 'FREE',
  tasks: 'FREE',
  calendar: 'FREE',
  notifications: 'FREE',
  qr_generator: 'FREE',
  finance: 'FREE',
  users: 'FREE',
  inventory: 'FREE',

  // PLUS tier features
  documents: 'PLUS',
  whiteboards: 'PLUS',
  chat: 'PLUS',
  time_tracker: 'PLUS',
  workforce: 'PLUS',

  // PRO tier features
  drive: 'PRO',
  ai_lab: 'PRO',
  voice_assistant: 'PRO',
  tuna: 'PRO',
};

/**
 * Get the tier index for comparison
 */
export function getTierIndex(tier: WorkspaceProductTier): number {
  return TIER_HIERARCHY.indexOf(tier);
}

/**
 * Check if a tier meets or exceeds the required tier
 */
export function meetsTierRequirement(
  currentTier: WorkspaceProductTier,
  requiredTier: WorkspaceProductTier
): boolean {
  return getTierIndex(currentTier) >= getTierIndex(requiredTier);
}

/**
 * Check if a tier meets ANY of the required tiers
 */
export function meetsAnyTierRequirement(
  currentTier: WorkspaceProductTier,
  requiredTiers: WorkspaceProductTier | WorkspaceProductTier[]
): boolean {
  const tiers = Array.isArray(requiredTiers) ? requiredTiers : [requiredTiers];
  return tiers.some((tier) => meetsTierRequirement(currentTier, tier));
}

/**
 * Get the minimum required tier from an array (lowest barrier to entry)
 */
export function getMinimumRequiredTier(
  tiers: WorkspaceProductTier[]
): WorkspaceProductTier {
  if (tiers.length === 0) return 'FREE';
  return tiers.reduce((min, tier) =>
    getTierIndex(tier) < getTierIndex(min) ? tier : min
  );
}

/**
 * Check if a feature is available for a given tier
 */
export function isFeatureAvailable(
  featureId: FeatureId,
  currentTier: WorkspaceProductTier = 'FREE'
): boolean {
  const requiredTier = FEATURE_TIERS[featureId];
  return meetsTierRequirement(currentTier, requiredTier);
}

/**
 * Get the required tier for a feature
 */
export function getRequiredTier(featureId: FeatureId): WorkspaceProductTier {
  return FEATURE_TIERS[featureId];
}

/**
 * Get all features available for a tier
 */
export function getFeaturesForTier(tier: WorkspaceProductTier): FeatureId[] {
  return (Object.entries(FEATURE_TIERS) as [FeatureId, WorkspaceProductTier][])
    .filter(([, requiredTier]) => meetsTierRequirement(tier, requiredTier))
    .map(([featureId]) => featureId);
}

/**
 * Get features that require upgrade from current tier
 */
export function getUpgradeFeatures(
  currentTier: WorkspaceProductTier
): FeatureId[] {
  return (Object.entries(FEATURE_TIERS) as [FeatureId, WorkspaceProductTier][])
    .filter(
      ([, requiredTier]) => !meetsTierRequirement(currentTier, requiredTier)
    )
    .map(([featureId]) => featureId);
}

/**
 * Helper to create requiredWorkspaceTier config for navigation
 */
export function createTierRequirement(
  featureId: FeatureId,
  options: { alwaysShow?: boolean } = {}
): {
  requiredTier: WorkspaceProductTier;
  alwaysShow?: boolean;
} {
  return {
    requiredTier: FEATURE_TIERS[featureId],
    alwaysShow: options.alwaysShow,
  };
}
