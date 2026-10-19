// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertGooglePreservationNegativeControls,
  assertGooglePreserved,
  googlePreservationBaseline,
} from './google-preservation';

function state() {
  return {
    user: { id: 'user', encrypted_password: 'fixture-hash' },
    google: {
      id: 'google',
      provider_id: 'subject',
      identity_data: { email_verified: true },
    },
    sessions: [
      { id: 'session', user_id: 'user', not_after: null, factor_id: null },
    ],
    tokens: [
      { id: 'refresh', user_id: 'user', session_id: 'session', revoked: false },
    ],
    mail: [{ id: 'message', body: 'retained' }],
  };
}
describe('real Google fixture preservation assertions', () => {
  it('accepts equal complete nonempty persisted rows', () => {
    expect(() =>
      assertGooglePreserved(state(), structuredClone(state()))
    ).not.toThrow();
  });
  it('runs all four preservation negative controls on nonempty observations', () => {
    expect(assertGooglePreservationNegativeControls(state(), state())).toBe(4);
  });
  it.each(['sessions', 'tokens'] as const)(
    'rejects an empty %s baseline',
    (key) => {
      const before = state();
      before[key] = [];
      expect(() => googlePreservationBaseline(before)).toThrow();
    }
  );
  it.each([
    'session-deleted',
    'token-deleted',
    'session-changed',
    'token-changed',
    'google-changed',
    'password-changed',
    'mail-deleted',
  ])('fails the actual qualification assertion for %s', (change) => {
    const before = state(),
      after = structuredClone(before);
    if (change === 'session-deleted') after.sessions = [];
    if (change === 'token-deleted') after.tokens = [];
    if (change === 'session-changed' && after.sessions[0])
      after.sessions[0].user_id = 'different-user';
    if (change === 'token-changed' && after.tokens[0])
      after.tokens[0].revoked = true;
    if (change === 'google-changed') after.google.provider_id = 'other-subject';
    if (change === 'password-changed')
      after.user.encrypted_password = 'changed';
    if (change === 'mail-deleted') after.mail = [];
    expect(() => assertGooglePreserved(before, after)).toThrow();
  });
});
