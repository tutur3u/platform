import { describe, expect, it } from 'vitest';
import {
  meetingAiGenerationFailureCode,
  meetingAiRequestFailure,
} from './request-failure';

describe('safe meeting AI failure guidance', () => {
  it.each([
    [402, undefined, 'failure_credits'],
    [403, undefined, 'failure_access'],
    [409, undefined, 'failure_conflict'],
    [502, 'MEET_AI_PROVIDER_LIMIT', 'failure_limit'],
    [503, undefined, 'failure_unavailable'],
  ])(
    'classifies HTTP %s without raw response messages',
    (status, code, key) => {
      const result = meetingAiRequestFailure({
        status,
        code,
        message: 'synthetic-private-provider-body',
      });
      expect(result.key).toBe(key);
      expect(JSON.stringify(result)).not.toContain('synthetic-private');
    }
  );
  it('drops unknown codes, invalid statuses and non-object errors', () => {
    expect(
      meetingAiRequestFailure({ status: '402', code: 'synthetic-private-url' })
    ).toEqual({ status: null, code: null, key: null });
    expect(meetingAiRequestFailure({ status: 1000 })).toEqual({
      status: null,
      code: null,
      key: null,
    });
    expect(meetingAiRequestFailure('synthetic-private-body')).toEqual({
      status: null,
      code: null,
      key: null,
    });
  });
  it('generation codes are fixed even for an unknown reason', () => {
    expect(meetingAiGenerationFailureCode('quota_exceeded')).toBe(
      'MEET_AI_PROVIDER_LIMIT'
    );
    expect(
      meetingAiGenerationFailureCode('synthetic-private-provider-body')
    ).toBe('MEET_AI_PROCESSING_FAILED');
  });
});
