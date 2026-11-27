import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it } from 'vitest';
import {
  isMailboxForbidden,
  isStaleMailboxAccessError,
} from './mail-read-query';

describe('isStaleMailboxAccessError', () => {
  it('treats refused and missing mailboxes as stale after an account switch', () => {
    expect(
      isStaleMailboxAccessError(new InternalApiError('Forbidden', 403))
    ).toBe(true);
    expect(
      isStaleMailboxAccessError(new InternalApiError('Not found', 404))
    ).toBe(true);
  });

  it('keeps server failures and unknown errors on the generic failure path', () => {
    expect(
      isStaleMailboxAccessError(new InternalApiError('Server error', 500))
    ).toBe(false);
    expect(isStaleMailboxAccessError(new Error('offline'))).toBe(false);
    expect(isStaleMailboxAccessError(undefined)).toBe(false);
  });

  it('agrees with the forbidden check for 403', () => {
    const forbidden = new InternalApiError('Forbidden', 403);
    expect(isMailboxForbidden(forbidden)).toBe(true);
    expect(isStaleMailboxAccessError(forbidden)).toBe(true);
  });
});
