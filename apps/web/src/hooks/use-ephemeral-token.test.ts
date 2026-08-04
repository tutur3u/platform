import { describe, expect, it } from 'vitest';
import { LiveClientError } from '@/lib/live/errors';
import { classifyLiveInitializationError } from './use-ephemeral-token';

describe('classifyLiveInitializationError', () => {
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
