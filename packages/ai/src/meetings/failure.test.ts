import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { describeMeetAiFailure, MeetAiGenerationError } from './failure';

describe('Meet provider diagnostics', () => {
  it.each([
    [400, 'API key not valid', 'invalid_api_key'],
    [403, 'API has not been used or is disabled', 'api_disabled'],
    [412, 'User location is not supported', 'unsupported_location'],
    [429, 'Quota exhausted', 'quota_exceeded'],
    [403, 'Permission denied', 'access_denied'],
    [404, 'Missing model', 'model_not_found'],
    [400, 'Unexpected request', 'provider_rejected_request'],
  ])('classifies %s safely', (statusCode, message, reason) => {
    const error = new APICallError({
      message: `${message}: sensitive-provider-detail`,
      url: 'https://example.invalid?key=sensitive-key',
      requestBodyValues: { audio: 'sensitive-audio' },
      responseBody: 'sensitive-response',
      statusCode,
    });
    expect(describeMeetAiFailure(error)).toEqual({
      reason,
      providerStatus: statusCode,
    });
    expect(JSON.stringify(describeMeetAiFailure(error))).not.toContain(
      'sensitive'
    );
  });

  it('preserves the safe classification when errors are rethrown', () => {
    const error = new MeetAiGenerationError('unsupported_location', 412);
    expect(describeMeetAiFailure(error)).toEqual({
      reason: 'unsupported_location',
      providerStatus: 412,
    });
    expect(error.status).toBe(502);
    expect(new MeetAiGenerationError('runtime_error').status).toBe(500);
  });
  it('does not serialize unknown error objects or request context', () => {
    expect(describeMeetAiFailure({ secret: 'private' })).toEqual({
      reason: 'runtime_error',
      providerStatus: null,
    });
    expect(describeMeetAiFailure(new Error('Request timed out'))).toEqual({
      reason: 'timeout',
      providerStatus: null,
    });
  });
});
