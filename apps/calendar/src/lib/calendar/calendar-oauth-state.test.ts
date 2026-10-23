import { describe, expect, it } from 'vitest';
import {
  createCalendarOAuthState,
  verifyCalendarOAuthState,
} from './calendar-oauth-state';

const input = { userId: 'user-1', wsId: 'workspace-1' };

describe('calendar OAuth state', () => {
  it('round-trips the initiating user and workspace', () => {
    const state = createCalendarOAuthState('google', input, 'secret');

    expect(verifyCalendarOAuthState('google', state, 'secret')).toEqual({
      ok: true,
      ...input,
    });
  });

  it('is unique per flow', () => {
    expect(createCalendarOAuthState('google', input, 'secret')).not.toBe(
      createCalendarOAuthState('google', input, 'secret')
    );
  });

  it('does not verify across providers or keys', () => {
    const state = createCalendarOAuthState('google', input, 'secret');

    expect(verifyCalendarOAuthState('microsoft', state, 'secret')).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(verifyCalendarOAuthState('google', state, 'other')).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('rejects expired, empty and malformed values', () => {
    const now = Date.now();
    const state = createCalendarOAuthState('google', input, 'secret', now);

    expect(
      verifyCalendarOAuthState('google', state, 'secret', now + 10 * 60 * 1000)
    ).toEqual({ ok: false, reason: 'expired' });
    for (const value of [null, '', 'workspace-1', `${state}.extra`]) {
      expect(verifyCalendarOAuthState('google', value, 'secret')).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });
});
