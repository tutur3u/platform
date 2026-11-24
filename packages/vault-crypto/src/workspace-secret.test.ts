import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { VaultCryptoError } from './errors';
import {
  openWorkspaceSecret,
  rewrapWorkspaceSecretKey,
  sealWorkspaceSecret,
  workspaceSecretLast4,
} from './workspace-secret';

// Throwaway keys generated per run; no key material is stored anywhere.
const kek = randomBytes(32);
const otherKek = randomBytes(32);
const binding = {
  name: 'DRIVE_R2_SECRET_ACCESS_KEY',
  secretId: '39120000-0000-4000-8000-0000000000c1',
  wsId: '39120000-0000-4000-8000-0000000000a1',
};
const value = 'synthetic-credential-value-0001';

async function sealed() {
  return sealWorkspaceSecret({
    binding,
    kek,
    kekVersion: 1,
    sourceRev: 3,
    value,
  });
}

async function expectDecryptFailure(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(VaultCryptoError);
  await expect(promise).rejects.toMatchObject({ code: 'decrypt_failed' });
}

describe('workspace secret envelopes', () => {
  it('round-trips a value and reports only the last four characters', async () => {
    const payload = await sealed();
    expect(payload.last4).toBe('0001');
    expect(new TextDecoder().decode(payload.ciphertext)).not.toContain(value);
    await expect(
      openWorkspaceSecret({
        ...payload,
        binding,
        kek,
        kekVersion: 1,
        sourceRev: 3,
      })
    ).resolves.toBe(value);
  });

  it('uses a fresh data key and nonce for every seal', async () => {
    const [a, b] = await Promise.all([sealed(), sealed()]);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.wrappedDek).not.toEqual(b.wrappedDek);
  });

  it.each([
    ['workspace', { ...binding, wsId: '39120000-0000-4000-8000-0000000000a2' }],
    ['row', { ...binding, secretId: '39120000-0000-4000-8000-0000000000c2' }],
    ['name', { ...binding, name: 'DRIVE_R2_ACCESS_KEY_ID' }],
  ])('fails when the %s binding differs', async (_label, other) => {
    const payload = await sealed();
    await expectDecryptFailure(
      openWorkspaceSecret({
        ...payload,
        binding: other,
        kek,
        kekVersion: 1,
        sourceRev: 3,
      })
    );
  });

  it('fails for another value revision, KEK version or KEK', async () => {
    const payload = await sealed();
    await expectDecryptFailure(
      openWorkspaceSecret({
        ...payload,
        binding,
        kek,
        kekVersion: 1,
        sourceRev: 4,
      })
    );
    await expectDecryptFailure(
      openWorkspaceSecret({
        ...payload,
        binding,
        kek,
        kekVersion: 2,
        sourceRev: 3,
      })
    );
    await expectDecryptFailure(
      openWorkspaceSecret({
        ...payload,
        binding,
        kek: otherKek,
        kekVersion: 1,
        sourceRev: 3,
      })
    );
  });

  it('refuses a value ciphertext swapped between rows', async () => {
    const mine = await sealed();
    const theirs = await sealWorkspaceSecret({
      binding: { ...binding, secretId: '39120000-0000-4000-8000-0000000000c9' },
      kek,
      kekVersion: 1,
      sourceRev: 3,
      value: 'synthetic-other-value',
    });
    await expectDecryptFailure(
      openWorkspaceSecret({
        binding,
        ciphertext: theirs.ciphertext,
        kek,
        kekVersion: 1,
        sourceRev: 3,
        wrappedDek: mine.wrappedDek,
      })
    );
  });

  it('re-wraps to a new KEK version without changing the value ciphertext', async () => {
    const payload = await sealed();
    const wrappedDek = await rewrapWorkspaceSecretKey({
      binding,
      fromKek: kek,
      fromVersion: 1,
      toKek: otherKek,
      toVersion: 2,
      wrappedDek: payload.wrappedDek,
    });
    await expect(
      openWorkspaceSecret({
        binding,
        ciphertext: payload.ciphertext,
        kek: otherKek,
        kekVersion: 2,
        sourceRev: 3,
        wrappedDek,
      })
    ).resolves.toBe(value);
    await expectDecryptFailure(
      openWorkspaceSecret({
        binding,
        ciphertext: payload.ciphertext,
        kek,
        kekVersion: 1,
        sourceRev: 3,
        wrappedDek,
      })
    );
  });

  it('rejects invalid inputs before encrypting', async () => {
    await expect(
      sealWorkspaceSecret({ binding, kek, kekVersion: 0, sourceRev: 0, value })
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      sealWorkspaceSecret({ binding, kek, kekVersion: 1, sourceRev: -1, value })
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      sealWorkspaceSecret({
        binding,
        kek,
        kekVersion: 1,
        sourceRev: 0,
        value: '',
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      sealWorkspaceSecret({
        binding,
        kek: randomBytes(16),
        kekVersion: 1,
        sourceRev: 0,
        value,
      })
    ).rejects.toBeInstanceOf(VaultCryptoError);
  });

  it('hides the last four characters of short values', () => {
    expect(workspaceSecretLast4('short')).toBe('');
    expect(workspaceSecretLast4('long-enough-value')).toBe('alue');
  });
});
