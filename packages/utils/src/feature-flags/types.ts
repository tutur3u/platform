import type { FEATURE_FLAGS } from './data';

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export type FeatureFlagMap = Record<FeatureFlag, boolean>;
