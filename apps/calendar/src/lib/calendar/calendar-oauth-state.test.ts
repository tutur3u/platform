import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createCalendarOAuthState,
  deriveCalendarOAuthPkce,
  verifyCalendarOAuthState,
} from './calendar-oauth-state';

const input = { userId: 'user-1', wsId: 'workspace-1' };

describe('calendar OAuth state', () => {
  it('round-trips the initiating user and workspace', () => {
    const created = createCalendarOAuthState('google', input, 'secret');

    expect(verifyCalendarOAuthState('google', created.state, 'secret')).toEqual(
      {
        ok: true,
        expiresAt: created.expiresAt,
        nonce: created.nonce,
        ...input,
      }
    );
  });

  it('is unique per flow', () => {
    expect(createCalendarOAuthState('google', input, 'secret').nonce).not.toBe(
      createCalendarOAuthState('google', input, 'secret').nonce
    );
  });

  it('does not verify across providers or keys', () => {
    const { state } = createCalendarOAuthState('google', input, 'secret');

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
    const { state } = createCalendarOAuthState('google', input, 'secret', now);

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

  it('derives a server-only S256 PKCE pair per flow and provider', () => {
    const { nonce } = createCalendarOAuthState('google', input, 'secret');
    const pkce = deriveCalendarOAuthPkce('google', nonce, 'secret');

    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(pkce.codeChallenge).toBe(
      createHash('sha256').update(pkce.codeVerifier).digest('base64url')
    );
    expect(deriveCalendarOAuthPkce('google', nonce, 'secret')).toEqual(pkce);
    expect(deriveCalendarOAuthPkce('microsoft', nonce, 'secret')).not.toEqual(
      pkce
    );
    expect(deriveCalendarOAuthPkce('google', nonce, 'other')).not.toEqual(pkce);
  });
});
