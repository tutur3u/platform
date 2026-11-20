import { describe, expect, it } from 'vitest';
import { InternalApiError, LiveBlockedError } from '@tuturuuu/internal-api';
import { LiveClientError } from '@/lib/live/errors';
import { classifyLiveInitializationError } from './use-ephemeral-token';

describe('classifyLiveInitializationError', () => {
  it('routes a stable Live block to the blocked dialog, even on 402', () => {
    expect(
      classifyLiveInitializationError(
        new LiveBlockedError(
          {
            eligible: false,
            reason: 'credits_exhausted',
            tier: 'PLUS',
            billing: null,
            params: { plans: [] },
          },
          402,
          'LIVE_BLOCKED'
        )
      )
    ).toBe('LIVE_BLOCKED');
  });
  it('keeps the shared FREE budget error distinct for localized display', () => {
    expect(
      classifyLiveInitializationError(
        new InternalApiError(
          'Free Live daily budget exhausted',
          429,
          'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'
        )
      )
    ).toBe('FREE_LIVE_DAILY_BUDGET_EXHAUSTED');
  });
  it('distinguishes provider connection failures', () => {
    expect(
      classifyLiveInitializationError(
        new LiveClientError(
          'LIVE_CONNECTION_FAILED',
          'Gemini rejected the connection'
        )
      )
    ).toBe('CONNECTION_FAILED');
  });

  it('distinguishes denied and unavailable microphones', () => {
    expect(
      classifyLiveInitializationError(
        new DOMException('Permission denied', 'NotAllowedError')
      )
    ).toBe('MICROPHONE_DENIED');
    expect(
      classifyLiveInitializationError(
        new DOMException('Device is busy', 'NotReadableError')
      )
    ).toBe('MICROPHONE_UNAVAILABLE');
  });

  it('recognizes expired Live authorizations', () => {
    expect(
      classifyLiveInitializationError(new Error('LIVE_AUTHORIZATION_EXPIRED'))
    ).toBe('AUTHORIZATION_EXPIRED');
  });
});
