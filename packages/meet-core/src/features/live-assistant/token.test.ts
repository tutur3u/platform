import { expect, it } from 'vitest';
import { signLiveSession, verifyLiveSession } from './token';

const claims = {
  audience: 'meet-live' as const,
  sessionId: 'f83c73f6-f4fc-44c7-87f1-f3ce722d8c42',
  ownerId: '00000000-0000-4000-8000-000000009751',
  meetingId: '00000000-0000-4000-8000-000000009721',
  billingWorkspaceId: '00000000-0000-4000-8000-000000009711',
  mode: 'personal' as const,
  inputSource: 'private-microphone' as const,
  consentVersion: 'synthetic-v1',
  consentRevision: 1,
  workspaceAuthority: 'verified-personal' as const,
  expiresAt: 2000,
};
it('binds the session owner, audience, and expiry to its signature', () => {
  const signed = signLiveSession(claims, 'test-only-secret');
  expect(verifyLiveSession(signed, 'test-only-secret', 1000)).toEqual(claims);
  expect(verifyLiveSession(signed, 'test-only-secret', 2000)).toBeNull();
  expect(verifyLiveSession(signed, 'another-secret', 1000)).toBeNull();
  expect(
    verifyLiveSession(`${signed}.extra`, 'test-only-secret', 1000)
  ).toBeNull();
  const parts = signed.split('.');
  parts[0] = Buffer.from(JSON.stringify({ ...claims, mode: 'room' })).toString(
    'base64url'
  );
  expect(
    verifyLiveSession(parts.join('.'), 'test-only-secret', 1000)
  ).toBeNull();
});

it('refuses to mint a room or pre-click token', () => {
  expect(() =>
    signLiveSession({ ...claims, mode: 'room' }, 'test-only-secret')
  ).toThrow();
  expect(() =>
    signLiveSession(
      { ...claims, consentVersion: undefined },
      'test-only-secret'
    )
  ).toThrow();
});
