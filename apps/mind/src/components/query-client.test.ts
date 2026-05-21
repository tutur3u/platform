import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { shouldRetryMindQuery } from './query-client';

describe('Mind query retry policy', () => {
  it('does not retry client or authorization failures', () => {
    expect(
      shouldRetryMindQuery(0, new InternalApiError('Not found', 404))
    ).toBe(false);
    expect(
      shouldRetryMindQuery(0, new InternalApiError('Unauthorized', 401))
    ).toBe(false);
  });

  it('retries transient failures once only', () => {
    expect(
      shouldRetryMindQuery(0, new InternalApiError('Server error', 500))
    ).toBe(true);
    expect(
      shouldRetryMindQuery(1, new InternalApiError('Server error', 500))
    ).toBe(false);
    expect(shouldRetryMindQuery(0, new Error('network'))).toBe(true);
    expect(shouldRetryMindQuery(1, new Error('network'))).toBe(false);
  });
});
