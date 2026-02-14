import type { AiFeature, CreditErrorCode } from './constants.js';

export type { AiFeature, CreditErrorCode };

export interface CreditCheckResult {
  allowed: boolean;
  remainingCredits: number;
  tier: string;
  maxOutputTokens: number | null;
  errorCode: CreditErrorCode | null;
  errorMessage: string | null;
}

export interface CreditDeductionResult {
  success: boolean;
  creditsDeducted: number;
  remainingCredits: number;
  errorCode: string | null;
}

export interface AiCreditStatus {
  totalAllocated: number;
  totalUsed: number;
  remaining: number;
  bonusCredits: number;
  percentUsed: number;
  periodStart: string;
  periodEnd: string;
  tier: string;
  allowedModels: string[];
  allowedFeatures: string[];
  dailyLimit: number | null;
  dailyUsed: number;
  maxOutputTokens: number | null;
  balanceScope: 'user' | 'workspace';
  seatCount: number | null;
}

export interface CreditAllocation {
  tier: string;
  monthlyCredits: number;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  maxCreditsPerRequest: number | null;
  maxOutputTokensPerRequest: number | null;
  markupMultiplier: number;
  allowedModels: string[];
  allowedFeatures: string[];
  maxRequestsPerDay: number | null;
  isActive: boolean;
}

export interface FeatureAccess {
  tier: string;
  feature: AiFeature;
  enabled: boolean;
  maxRequestsPerDay: number | null;
}

export interface DeductCreditsParams {
  wsId: string;
  userId?: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  feature: AiFeature;
  executionId?: string;
  chatMessageId?: string;
  metadata?: Record<string, unknown>;
}
