import { describe, expect, it } from 'vitest';
import { AI_FEATURES, CREDIT_ERROR_CODES, CREDIT_UNIT_USD } from '../constants';

describe('constants', () => {
  describe('CREDIT_UNIT_USD', () => {
    it('equals 0.0001', () => {
      expect(CREDIT_UNIT_USD).toBe(0.0001);
    });

    it('represents 1 credit = $0.0001', () => {
      expect(10_000 * CREDIT_UNIT_USD).toBe(1); // 10k credits = $1
    });
  });

  describe('AI_FEATURES', () => {
    it('contains expected features', () => {
      expect(AI_FEATURES).toContain('chat');
      expect(AI_FEATURES).toContain('generate');
      expect(AI_FEATURES).toContain('task_journal');
      expect(AI_FEATURES).toContain('email_draft');
    });

    it('has at least 4 features', () => {
      expect(AI_FEATURES.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('CREDIT_ERROR_CODES', () => {
    it('contains all expected error codes', () => {
      expect(CREDIT_ERROR_CODES.CREDITS_EXHAUSTED).toBe('CREDITS_EXHAUSTED');
      expect(CREDIT_ERROR_CODES.MODEL_NOT_ALLOWED).toBe('MODEL_NOT_ALLOWED');
      expect(CREDIT_ERROR_CODES.FEATURE_NOT_ALLOWED).toBe(
        'FEATURE_NOT_ALLOWED'
      );
      expect(CREDIT_ERROR_CODES.DAILY_LIMIT_REACHED).toBe(
        'DAILY_LIMIT_REACHED'
      );
      expect(CREDIT_ERROR_CODES.NO_ALLOCATION).toBe('NO_ALLOCATION');
      expect(CREDIT_ERROR_CODES.NO_BALANCE).toBe('NO_BALANCE');
    });

    it('has exactly 6 error codes', () => {
      expect(Object.keys(CREDIT_ERROR_CODES)).toHaveLength(6);
    });
  });
});
