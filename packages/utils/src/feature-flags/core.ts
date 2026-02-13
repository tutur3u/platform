import { verifySecret } from '../workspace-helper';
import { FEATURE_FLAGS } from './data';
import type { FeatureFlag, FeatureFlagMap } from './types';

export async function requireFeatureFlags(
  wsId: string,
  {
    requiredFlags = [],
    forceAdmin = false,
  }: {
    requiredFlags: FeatureFlag[];
    forceAdmin?: boolean;
  }
): Promise<{ featureFlags: FeatureFlagMap; missingFlags: FeatureFlag[] }> {
  const featureFlags = await getFeatureFlags(wsId, forceAdmin);
  const missingFlags = requiredFlags.filter((flag) => !featureFlags[flag]);
  return {
    featureFlags,
    missingFlags,
  };
}

/**
 * Get all feature flags for a workspace
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<FeatureFlags>
 */
export async function getFeatureFlags(
  wsId: string,
  forceAdmin: boolean = true
): Promise<FeatureFlagMap> {
  const [
    ENABLE_AI,
    ENABLE_EDUCATION,
    ENABLE_QUIZZES,
    ENABLE_CHALLENGES,
    ENABLE_AI_ONLY,
    ENABLE_CHAT,
    ENABLE_TASKS,
    ENABLE_DOCS,
    ENABLE_DRIVE,
    ENABLE_SLIDES,
    DISABLE_INVITE,
    PREVENT_WORKSPACE_DELETION,
    ENABLE_AVATAR,
    ENABLE_LOGO,
  ] = await Promise.all([
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_AI,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_EDUCATION,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_QUIZZES,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_CHALLENGES,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_AI_ONLY,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_CHAT,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_TASKS,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_DOCS,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_DRIVE,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_SLIDES,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.DISABLE_INVITE,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.PREVENT_WORKSPACE_DELETION,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_AVATAR,
      value: 'true',
    }),
    verifySecret({
      forceAdmin,
      wsId,
      name: FEATURE_FLAGS.ENABLE_LOGO,
      value: 'true',
    }),
  ]);

  return {
    ENABLE_AI,
    ENABLE_EDUCATION,
    ENABLE_QUIZZES,
    ENABLE_CHALLENGES,
    ENABLE_AI_ONLY,
    ENABLE_CHAT,
    ENABLE_TASKS,
    ENABLE_DOCS,
    ENABLE_DRIVE,
    ENABLE_SLIDES,
    DISABLE_INVITE,
    PREVENT_WORKSPACE_DELETION,
    ENABLE_AVATAR,
    ENABLE_LOGO,
  };
}

/**
 * Get a specific feature flag
 * @param wsId - Workspace ID
 * @param flagName - Feature flag name
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function getFeatureFlag(
  wsId: string,
  flagName: FeatureFlag,
  forceAdmin: boolean = true
): Promise<boolean> {
  return verifySecret({
    forceAdmin,
    wsId,
    name: FEATURE_FLAGS[flagName],
    value: 'true',
  });
}

/**
 * Check if multiple feature flags are enabled
 * @param wsId - Workspace ID
 * @param flagNames - Array of feature flag names
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function areFeatureFlagsEnabled(
  wsId: string,
  flagNames: readonly FeatureFlag[],
  forceAdmin: boolean = true
): Promise<boolean> {
  const checks = await Promise.all(
    flagNames.map((flagName) =>
      verifySecret({
        forceAdmin,
        wsId,
        name: FEATURE_FLAGS[flagName],
        value: 'true',
      })
    )
  );
  return checks.every(Boolean);
}

/**
 * Check if any of the specified feature flags are enabled
 * @param wsId - Workspace ID
 * @param flagNames - Array of feature flag names
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function isAnyFeatureFlagEnabled(
  wsId: string,
  flagNames: readonly FeatureFlag[],
  forceAdmin: boolean = true
): Promise<boolean> {
  const checks = await Promise.all(
    flagNames.map((flagName) =>
      verifySecret({
        forceAdmin,
        wsId,
        name: FEATURE_FLAGS[flagName],
        value: 'true',
      })
    )
  );
  return checks.some(Boolean);
}

// Common feature flag combinations
export const FEATURE_GROUPS = {
  AI_FEATURES: [
    FEATURE_FLAGS.ENABLE_AI,
    FEATURE_FLAGS.ENABLE_CHAT,
    FEATURE_FLAGS.ENABLE_TASKS,
  ] as const,
  EDUCATION_FEATURES: [
    FEATURE_FLAGS.ENABLE_EDUCATION,
    FEATURE_FLAGS.ENABLE_QUIZZES,
    FEATURE_FLAGS.ENABLE_CHALLENGES,
    FEATURE_FLAGS.ENABLE_AI,
  ] as const,
  DOCUMENT_FEATURES: [
    FEATURE_FLAGS.ENABLE_DOCS,
    FEATURE_FLAGS.ENABLE_DRIVE,
    FEATURE_FLAGS.ENABLE_SLIDES,
  ] as const,
  WORKSPACE_FEATURES: [
    FEATURE_FLAGS.ENABLE_AVATAR,
    FEATURE_FLAGS.ENABLE_LOGO,
  ] as const,
} as const;

/**
 * Check if all AI features are enabled
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function areAIFeaturesEnabled(
  wsId: string,
  forceAdmin: boolean = true
): Promise<boolean> {
  return areFeatureFlagsEnabled(wsId, FEATURE_GROUPS.AI_FEATURES, forceAdmin);
}

/**
 * Check if all education features are enabled
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function areEducationFeaturesEnabled(
  wsId: string,
  forceAdmin: boolean = true
): Promise<boolean> {
  return areFeatureFlagsEnabled(
    wsId,
    FEATURE_GROUPS.EDUCATION_FEATURES,
    forceAdmin
  );
}

/**
 * Check if all document features are enabled
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function areDocumentFeaturesEnabled(
  wsId: string,
  forceAdmin: boolean = true
): Promise<boolean> {
  return areFeatureFlagsEnabled(
    wsId,
    FEATURE_GROUPS.DOCUMENT_FEATURES,
    forceAdmin
  );
}

/**
 * Check if any AI features are enabled
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function isAnyAIFeatureEnabled(
  wsId: string,
  forceAdmin: boolean = true
): Promise<boolean> {
  return isAnyFeatureFlagEnabled(wsId, FEATURE_GROUPS.AI_FEATURES, forceAdmin);
}

/**
 * Check if any education features are enabled
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<boolean>
 */
export async function isAnyEducationFeatureEnabled(
  wsId: string,
  forceAdmin: boolean = true
): Promise<boolean> {
  return isAnyFeatureFlagEnabled(
    wsId,
    FEATURE_GROUPS.EDUCATION_FEATURES,
    forceAdmin
  );
}
