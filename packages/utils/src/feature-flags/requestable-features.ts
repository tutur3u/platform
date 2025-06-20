import { FEATURE_FLAGS } from './data';
import type { FeatureFlag } from './types';
import { BookText, HelpCircle, Sparkles, Trophy } from '@tuturuuu/ui/icons';

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

// Create a mapping from feature flag to requestable feature key
export const FEATURE_FLAG_TO_REQUESTABLE_KEY: Record<
  FeatureFlag,
  RequestableFeatureKey | null
> = {
  ENABLE_AI: 'ai',
  ENABLE_EDUCATION: 'education',
  ENABLE_QUIZZES: 'quizzes',
  ENABLE_CHALLENGES: 'challenges',
  // Non-requestable features
  ENABLE_AI_ONLY: null,
  ENABLE_CHAT: null,
  ENABLE_TASKS: null,
  ENABLE_DOCS: null,
  ENABLE_DRIVE: null,
  ENABLE_SLIDES: null,
  DISABLE_INVITE: null,
  PREVENT_WORKSPACE_DELETION: null,
  ENABLE_AVATAR: null,
  ENABLE_LOGO: null,
};

// Reverse mapping from requestable key to feature flag
export const REQUESTABLE_KEY_TO_FEATURE_FLAG: Record<
  RequestableFeatureKey,
  FeatureFlag
> = {
  ai: FEATURE_FLAGS.ENABLE_AI,
  education: FEATURE_FLAGS.ENABLE_EDUCATION,
  quizzes: FEATURE_FLAGS.ENABLE_QUIZZES,
  challenges: FEATURE_FLAGS.ENABLE_CHALLENGES,
};
