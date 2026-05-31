/** 1 credit = this many USD */
export const CREDIT_UNIT_USD = 0.0001;

/** AI feature slugs used throughout the credit system */
export const AI_FEATURES = [
  'chat',
  'generate',
  'task_journal',
  'email_draft',
  'image_generation',
  'embeddings',
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

/** Error codes returned by credit checks */
export const CREDIT_ERROR_CODES = {
  CREDITS_EXHAUSTED: 'CREDITS_EXHAUSTED',
  MODEL_NOT_ALLOWED: 'MODEL_NOT_ALLOWED',
  MODEL_DISABLED: 'MODEL_DISABLED',
  MODEL_PRICING_UNAVAILABLE: 'MODEL_PRICING_UNAVAILABLE',
  FEATURE_NOT_ALLOWED: 'FEATURE_NOT_ALLOWED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  NO_ALLOCATION: 'NO_ALLOCATION',
  NO_BALANCE: 'NO_BALANCE',
  CREDIT_CHECK_FAILED: 'CREDIT_CHECK_FAILED',
} as const;

export type CreditErrorCode =
  (typeof CREDIT_ERROR_CODES)[keyof typeof CREDIT_ERROR_CODES];
