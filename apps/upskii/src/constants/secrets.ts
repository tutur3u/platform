/**
 * Feature Flags Utility
 *
 * This module provides a centralized way to manage feature flags and permissions
 * using workspace secrets. It abstracts the verification logic and provides
 * type-safe functions for checking feature availability.
 *
 * Usage Examples:
 *
 * 1. Get all feature flags for a workspace:
 * ```typescript
 * const flags = await getFeatureFlags(wsId);
 * if (flags.ENABLE_EDUCATION) {
 *   // Show education features
 * }
 * ```
 *
 * 2. Check a specific feature flag:
 * ```typescript
 * const hasAI = await getFeatureFlag(wsId, 'ENABLE_AI');
 * ```
 *
 * 3. Check multiple feature flags:
 * ```typescript
 * const hasAllAI = await areFeatureFlagsEnabled(wsId, ['ENABLE_AI', 'ENABLE_CHAT']);
 * const hasAnyAI = await isAnyFeatureFlagEnabled(wsId, ['ENABLE_AI', 'ENABLE_CHAT']);
 * ```
 *
 * 4. Use predefined feature groups:
 * ```typescript
 * const hasEducation = await areEducationFeaturesEnabled(wsId);
 * const hasAnyAI = await isAnyAIFeatureEnabled(wsId);
 * ```
 *
 * 5. In layout components for conditional rendering:
 * ```typescript
 * const { ENABLE_EDUCATION, ENABLE_AI } = await getFeatureFlags(wsId);
 *
 * const navLinks = [
 *   {
 *     title: 'Education',
 *     href: '/education',
 *     disabled: !ENABLE_EDUCATION || withoutPermission('ai_lab'),
 *   }
 * ];
 * ```
 */
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

// Feature flag names - centralized for consistency
export const FEATURE_FLAGS = {
  ENABLE_AI: 'ENABLE_AI',
  ENABLE_EDUCATION: 'ENABLE_EDUCATION',
  ENABLE_QUIZZES: 'ENABLE_QUIZZES',
  ENABLE_CHALLENGES: 'ENABLE_CHALLENGES',
  ENABLE_AI_ONLY: 'ENABLE_AI_ONLY',
  ENABLE_CHAT: 'ENABLE_CHAT',
  ENABLE_TASKS: 'ENABLE_TASKS',
  ENABLE_DOCS: 'ENABLE_DOCS',
  ENABLE_DRIVE: 'ENABLE_DRIVE',
  ENABLE_SLIDES: 'ENABLE_SLIDES',
  DISABLE_INVITE: 'DISABLE_INVITE',
  PREVENT_WORKSPACE_DELETION: 'PREVENT_WORKSPACE_DELETION',
  ENABLE_AVATAR: 'ENABLE_AVATAR',
  ENABLE_LOGO: 'ENABLE_LOGO',
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

// Interface for feature flags result
export interface FeatureFlags {
  ENABLE_AI: boolean;
  ENABLE_EDUCATION: boolean;
  ENABLE_QUIZZES: boolean;
  ENABLE_CHALLENGES: boolean;
  ENABLE_AI_ONLY: boolean;
  ENABLE_CHAT: boolean;
  ENABLE_TASKS: boolean;
  ENABLE_DOCS: boolean;
  ENABLE_DRIVE: boolean;
  ENABLE_SLIDES: boolean;
  DISABLE_INVITE: boolean;
  PREVENT_WORKSPACE_DELETION: boolean;
  ENABLE_AVATAR: boolean;
  ENABLE_LOGO: boolean;
}

// Default values for feature flags
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  ENABLE_AI: false,
  ENABLE_EDUCATION: false,
  ENABLE_QUIZZES: false,
  ENABLE_CHALLENGES: false,
  ENABLE_AI_ONLY: false,
  ENABLE_CHAT: false,
  ENABLE_TASKS: false,
  ENABLE_DOCS: false,
  ENABLE_DRIVE: false,
  ENABLE_SLIDES: false,
  DISABLE_INVITE: false,
  PREVENT_WORKSPACE_DELETION: false,
  ENABLE_AVATAR: false,
  ENABLE_LOGO: false,
};

/**
 * Get all feature flags for a workspace
 * @param wsId - Workspace ID
 * @param forceAdmin - Whether to use admin client (default: true for feature flags)
 * @returns Promise<FeatureFlags>
 */
export async function getFeatureFlags(
  wsId: string,
  forceAdmin: boolean = true
): Promise<FeatureFlags> {
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
  flagName: FeatureFlagName,
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
  flagNames: readonly FeatureFlagName[],
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
  flagNames: readonly FeatureFlagName[],
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
