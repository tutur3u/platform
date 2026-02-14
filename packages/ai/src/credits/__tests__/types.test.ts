import { describe, expect, it } from 'vitest';
import type {
  AiCreditStatus,
  CreditAllocation,
  CreditCheckResult,
  CreditDeductionResult,
  DeductCreditsParams,
  FeatureAccess,
} from '../types';

describe('types', () => {
  describe('AiCreditStatus', () => {
    it('accepts a valid status object', () => {
      const status: AiCreditStatus = {
        totalAllocated: 10000,
        totalUsed: 500,
        remaining: 9500,
        bonusCredits: 0,
        percentUsed: 5,
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-03-01T00:00:00.000Z',
        tier: 'FREE',
        allowedModels: [],
        allowedFeatures: [],
        dailyLimit: null,
        dailyUsed: 0,
        maxOutputTokens: null,
        balanceScope: 'user',
        seatCount: null,
      };

      expect(status.remaining).toBe(status.totalAllocated - status.totalUsed);
      expect(status.balanceScope).toBe('user');
    });

    it('accepts workspace scope with seat count', () => {
      const status: AiCreditStatus = {
        totalAllocated: 50000,
        totalUsed: 10000,
        remaining: 40000,
        bonusCredits: 0,
        percentUsed: 20,
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-03-01T00:00:00.000Z',
        tier: 'PLUS',
        allowedModels: ['google/gemini-2.5-flash'],
        allowedFeatures: ['chat', 'generate'],
        dailyLimit: 5000,
        dailyUsed: 200,
        maxOutputTokens: 8192,
        balanceScope: 'workspace',
        seatCount: 5,
      };

      expect(status.balanceScope).toBe('workspace');
      expect(status.seatCount).toBe(5);
      expect(status.dailyLimit).toBe(5000);
    });

    it('correctly represents exhausted credits', () => {
      const status: AiCreditStatus = {
        totalAllocated: 10000,
        totalUsed: 10000,
        remaining: 0,
        bonusCredits: 0,
        percentUsed: 100,
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-03-01T00:00:00.000Z',
        tier: 'FREE',
        allowedModels: [],
        allowedFeatures: [],
        dailyLimit: null,
        dailyUsed: 0,
        maxOutputTokens: null,
        balanceScope: 'user',
        seatCount: null,
      };

      expect(status.remaining).toBe(0);
      expect(status.percentUsed).toBe(100);
    });

    it('handles bonus credits in remaining calculation', () => {
      const totalAllocated = 10000;
      const bonusCredits = 5000;
      const totalUsed = 12000;
      const totalPool = totalAllocated + bonusCredits;
      const remaining = totalPool - totalUsed;

      expect(remaining).toBe(3000);
      expect((totalUsed / totalPool) * 100).toBeCloseTo(80);
    });
  });

  describe('CreditCheckResult', () => {
    it('represents an allowed check', () => {
      const result: CreditCheckResult = {
        allowed: true,
        remainingCredits: 9500,
        tier: 'FREE',
        maxOutputTokens: null,
        errorCode: null,
        errorMessage: null,
      };

      expect(result.allowed).toBe(true);
      expect(result.errorCode).toBeNull();
    });

    it('represents a denied check with error code', () => {
      const result: CreditCheckResult = {
        allowed: false,
        remainingCredits: 0,
        tier: 'FREE',
        maxOutputTokens: null,
        errorCode: 'CREDITS_EXHAUSTED',
        errorMessage: 'No credits remaining for this period',
      };

      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('CREDITS_EXHAUSTED');
    });
  });

  describe('CreditDeductionResult', () => {
    it('represents a successful deduction', () => {
      const result: CreditDeductionResult = {
        success: true,
        creditsDeducted: 15,
        remainingCredits: 9985,
        errorCode: null,
      };

      expect(result.success).toBe(true);
      expect(result.creditsDeducted).toBeGreaterThan(0);
    });

    it('represents a failed deduction', () => {
      const result: CreditDeductionResult = {
        success: false,
        creditsDeducted: 0,
        remainingCredits: 0,
        errorCode: 'NO_BALANCE',
      };

      expect(result.success).toBe(false);
      expect(result.creditsDeducted).toBe(0);
    });
  });

  describe('DeductCreditsParams', () => {
    it('accepts minimal required params', () => {
      const params: DeductCreditsParams = {
        wsId: '00000000-0000-0000-0000-000000000001',
        modelId: 'google/gemini-2.5-flash',
        inputTokens: 100,
        outputTokens: 50,
        feature: 'chat',
      };

      expect(params.userId).toBeUndefined();
      expect(params.reasoningTokens).toBeUndefined();
      expect(params.metadata).toBeUndefined();
    });

    it('accepts all optional params', () => {
      const params: DeductCreditsParams = {
        wsId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000002',
        modelId: 'anthropic/claude-3-opus',
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 200,
        feature: 'task_journal',
        executionId: '00000000-0000-0000-0000-000000000003',
        chatMessageId: '00000000-0000-0000-0000-000000000004',
        metadata: { source: 'test' },
      };

      expect(params.userId).toBeDefined();
      expect(params.reasoningTokens).toBe(200);
      expect(params.metadata).toEqual({ source: 'test' });
    });
  });

  describe('CreditAllocation', () => {
    it('represents a FREE tier allocation', () => {
      const alloc: CreditAllocation = {
        tier: 'FREE',
        monthlyCredits: 10000,
        dailyLimit: null,
        weeklyLimit: null,
        maxCreditsPerRequest: null,
        maxOutputTokensPerRequest: null,
        markupMultiplier: 1.0,
        allowedModels: [],
        allowedFeatures: [],
        maxRequestsPerDay: null,
        isActive: true,
      };

      expect(alloc.markupMultiplier).toBe(1.0);
      expect(alloc.allowedModels).toHaveLength(0);
    });

    it('represents a PAID tier allocation with model restrictions', () => {
      const alloc: CreditAllocation = {
        tier: 'PRO',
        monthlyCredits: 30000,
        dailyLimit: 5000,
        weeklyLimit: null,
        maxCreditsPerRequest: null,
        maxOutputTokensPerRequest: 16384,
        markupMultiplier: 1.0,
        allowedModels: ['google/gemini-2.5-flash', 'anthropic/claude-3-sonnet'],
        allowedFeatures: ['chat', 'generate', 'task_journal'],
        maxRequestsPerDay: 100,
        isActive: true,
      };

      expect(alloc.allowedModels).toHaveLength(2);
      expect(alloc.maxRequestsPerDay).toBe(100);
    });
  });

  describe('FeatureAccess', () => {
    it('represents an enabled feature', () => {
      const access: FeatureAccess = {
        tier: 'FREE',
        feature: 'chat',
        enabled: true,
        maxRequestsPerDay: 50,
      };

      expect(access.enabled).toBe(true);
      expect(access.maxRequestsPerDay).toBe(50);
    });

    it('represents a disabled feature', () => {
      const access: FeatureAccess = {
        tier: 'FREE',
        feature: 'email_draft',
        enabled: false,
        maxRequestsPerDay: null,
      };

      expect(access.enabled).toBe(false);
    });
  });
});
