import * as nodeCrypto from 'node:crypto';
import { expect, it, vi } from 'vitest';
import * as crypto from '../crypto';
import {
  createMeetGuestSession,
  verifyMeetGuestSession,
} from '../meet-guest-session';
import { createSignedAccessToken } from '../signed-access-token';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeCrypto>();
  return { ...actual, createHash: vi.fn(actual.createHash) };
});

const legacy =
  '7a37b85c8918eac19a9089c0fa5a2ab4dce3f90528dcdeec108b23ddf3607b99';

it('requires reset for a legacy row without hashing or checking its password', async () => {
  vi.mocked(nodeCrypto.createHash).mockClear();
  for (const password of ['password', 'wrong', legacy]) {
    expect(
      await crypto.verifyPassword(password, { hash: legacy, salt: 'salt' })
    ).toEqual({
      valid: false,
      resetRequired: true,
      needsRehash: false,
      scheme: 'legacy-sha256',
    });
  }
  expect(nodeCrypto.createHash).not.toHaveBeenCalled();
  expect(crypto).not.toHaveProperty('hashLegacyPassword');
});

it.each(['1d455debda48eb', 'malformed', 'scrypt$malformed'])(
  'requires reset for unsupported stored hash %s without computing SHA-256',
  async (hash) => {
    vi.mocked(nodeCrypto.createHash).mockClear();
    expect(await crypto.verifyPassword('password', { hash })).toMatchObject({
      valid: false,
      needsRehash: false,
      resetRequired: true,
    });
    expect(crypto.passwordRequiresReset(hash)).toBe(true);
    expect(nodeCrypto.createHash).not.toHaveBeenCalled();
  }
);

it.each(['', null, undefined])(
  'does not classify an absent credential %s as requiring reset',
  async (hash) => {
    expect(crypto.passwordRequiresReset(hash)).toBe(false);
    expect(await crypto.verifyPassword('password', { hash })).toMatchObject({
      valid: false,
      resetRequired: false,
    });
  }
);

it('continues verifying scrypt credentials', async () => {
  const hash = await crypto.hashPassword('current password');
  expect(crypto.passwordRequiresReset(hash)).toBe(false);
  expect(
    await crypto.verifyPassword('current password', { hash })
  ).toMatchObject({ valid: true, resetRequired: false, scheme: 'scrypt' });
  expect(await crypto.verifyPassword('wrong', { hash })).toMatchObject({
    valid: false,
    resetRequired: false,
  });
});

it('rejects guest tokens issued under the retired verifier policy', () => {
  const options = { secret: 'test-only-reset-policy-secret-00000000' };
  const planId = '00000000-0000-4000-8000-000000000001';
  const guestId = '00000000-0000-4000-8000-000000000002';
  const old = createSignedAccessToken(
    'meet-guest-session',
    { pid: planId, sub: guestId },
    600,
    options
  );
  expect(verifyMeetGuestSession(old.token, planId, options)).toBeNull();
  const current = createMeetGuestSession({ planId, guestId }, options);
  expect(verifyMeetGuestSession(current.token, planId, options)).toEqual({
    guestId,
  });
});
