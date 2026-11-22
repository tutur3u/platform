import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  issueCredentialAfterMobileLogin,
  refreshMastermindMobileSession,
} from './mastermind-mobile-provenance';
import { verifyMobileClientCredential } from './mobile-client-credential';

const owner = '11111111-1111-4111-8111-111111111111';
const native = { userId: owner, sessionId: 'device-session' };
const web = { userId: owner, sessionId: 'web-session' };
const mocks = vi.hoisted(() => ({ store: vi.fn() }));
vi.mock('@/lib/mastermind/fleet/auth', () => ({
  fleetOwnerIds: () => [owner],
}));
vi.mock('@/lib/mastermind/store', () => ({ getMastermindStore: mocks.store }));

const accessToken = (session: typeof native) =>
  `header.${Buffer.from(
    JSON.stringify({
      sub: session.userId,
      session_id: session.sessionId,
    })
  ).toString('base64url')}.signature`;

describe('Mastermind native-session provenance', () => {
  beforeEach(() => {
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', owner);
    mocks.store.mockReset().mockResolvedValue(createMemoryMastermindStore());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('seeds a verified native login and renews only the same recorded session', async () => {
    expect(await refreshMastermindMobileSession(native)).toBe(false);
    const issued = await issueCredentialAfterMobileLogin(
      { access_token: accessToken(native) },
      { id: owner }
    );
    expect(
      verifyMobileClientCredential(issued?.token, {
        ...native,
        requireMastermindSession: true,
      })
    ).toBe(true);
    expect(await refreshMastermindMobileSession(native)).toBe(true);
    expect(await refreshMastermindMobileSession(web)).toBe(false);
  });

  it('fails closed for privileged credentials if the store is unavailable', async () => {
    mocks.store.mockRejectedValue(new Error('offline'));
    const issued = await issueCredentialAfterMobileLogin(
      { access_token: accessToken(native) },
      { id: owner }
    );
    expect(verifyMobileClientCredential(issued?.token, native)).toBe(true);
    expect(
      verifyMobileClientCredential(issued?.token, {
        ...native,
        requireMastermindSession: true,
      })
    ).toBe(false);
    expect(await refreshMastermindMobileSession(native)).toBe(false);
  });
});
