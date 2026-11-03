// @vitest-environment node
import {
  createAppSessionTokenPair,
  getAppSessionClaimsFromRequest,
} from '@tuturuuu/auth/app-session-core';
import { describe, expect, it } from 'vitest';

describe('preserved Contacts signed session contract', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const secret = 'contacts-disposable-test-only-signing-key';
  const options = { targetApp: 'contacts', secret, now };
  function request(targetApp: string) {
    const token = createAppSessionTokenPair(
      { targetApp, userId: 'fixture-user', email: 'fixture@example.test' },
      { secret, now }
    ).access.token;
    return new Request('https://contacts.tutur3u.com/ws/users', {
      headers: { cookie: `tuturuuu_app_session=${token}` },
    });
  }
  it('accepts Contacts and rejects wrong app, key and expiry using the real portable core', () => {
    expect(
      getAppSessionClaimsFromRequest(request('contacts'), options)?.sub
    ).toBe('fixture-user');
    expect(
      getAppSessionClaimsFromRequest(request('drive'), options)
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request('contacts'), {
        ...options,
        secret: 'wrong-key',
      })
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request('contacts'), {
        ...options,
        now: new Date('2030-01-01'),
      })
    ).toBeNull();
  });
});
