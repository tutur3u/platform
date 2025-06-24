import { BookText, HelpCircle, Sparkles, Trophy } from '@tuturuuu/ui/icons';
import { FEATURE_FLAGS } from './data';
import type { FeatureFlag } from './types';

export interface RequestableFeatureConfig {
  flag: FeatureFlag;
  name: string;
  icon: typeof BookText; // Using one of the icons as the type base
}

export const REQUESTABLE_FEATURES = {
  ai: {
    flag: FEATURE_FLAGS.ENABLE_AI,
    name: 'AI',
    icon: Sparkles,
  },
  education: {
    flag: FEATURE_FLAGS.ENABLE_EDUCATION,
    name: 'Education',
    icon: BookText,
  },
  quizzes: {
    flag: FEATURE_FLAGS.ENABLE_QUIZZES,
    name: 'Quizzes',
    icon: HelpCircle,
  },
  challenges: {
    flag: FEATURE_FLAGS.ENABLE_CHALLENGES,
    name: 'Challenges',
    icon: Trophy,
  },
} as const satisfies Record<string, RequestableFeatureConfig>;

export type RequestableFeatureKey = keyof typeof REQUESTABLE_FEATURES;

// Type guard to check if a feature key is requestable
export function isRequestableFeature(
  key: string
): key is RequestableFeatureKey {
  return key in REQUESTABLE_FEATURES;
}

// Get requestable feature config by key
export function getRequestableFeature(
  key: RequestableFeatureKey
): RequestableFeatureConfig {
  return REQUESTABLE_FEATURES[key];
}

// Get all requestable feature keys
export function getRequestableFeatureKeys(): RequestableFeatureKey[] {
  return Object.keys(REQUESTABLE_FEATURES) as RequestableFeatureKey[];
}

// Derive mappings from REQUESTABLE_FEATURES
export const REQUESTABLE_KEY_TO_FEATURE_FLAG = Object.entries(
  REQUESTABLE_FEATURES
).reduce(
  (acc, [key, config]) => {
    acc[key as RequestableFeatureKey] = config.flag;
    return acc;
  },
  {} as Record<RequestableFeatureKey, FeatureFlag>
);
export const FEATURE_FLAG_TO_REQUESTABLE_KEY = Object.entries(
  REQUESTABLE_FEATURES
).reduce(
  (acc, [key, config]) => {
    acc[config.flag] = key as RequestableFeatureKey;
    return acc;
  },
  {} as Partial<Record<FeatureFlag, RequestableFeatureKey>>
);
// Helper to get requestable key from feature flag
export function getRequestableKeyFromFeatureFlag(
  flag: FeatureFlag
): RequestableFeatureKey | null {
  return FEATURE_FLAG_TO_REQUESTABLE_KEY[flag] ?? null;
}
