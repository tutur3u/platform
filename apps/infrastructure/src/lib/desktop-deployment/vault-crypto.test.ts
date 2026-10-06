import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/encryption', () => ({
  decryptWorkspaceKey: vi.fn(),
  encryptWorkspaceKey: vi.fn(),
  generateWorkspaceKey: vi.fn(),
  getMasterKey: vi.fn(),
}));

import {
  DesktopVaultCryptoError,
  decryptDesktopResource,
  encryptDesktopResource,
} from './vault-crypto';

const identity = {
  versionId: '00000000-0000-4000-8000-000000000001',
  platform: 'windows' as const,
  name: 'windows_authenticode_certificate_pfx',
};

function fixture() {
  const key = randomBytes(32);
  const plaintext = Buffer.from('synthetic private test resource');
  const encrypted = encryptDesktopResource(plaintext, key, identity);
  return { key, plaintext, encrypted };
}

describe('desktop version-bound encrypted resources', () => {
  it('round-trips bytes without placing plaintext in the stored envelope', () => {
    const { key, plaintext, encrypted } = fixture();
    expect(encrypted.ciphertext).not.toContain(plaintext.toString());
    expect(
      decryptDesktopResource(encrypted.ciphertext, key, identity, encrypted)
    ).toEqual(plaintext);
  });

  it('uses a fresh nonce for repeated values', () => {
    const { key, plaintext, encrypted } = fixture();
    expect(
      encryptDesktopResource(plaintext, key, identity).ciphertext
    ).not.toBe(encrypted.ciphertext);
  });

  it.each([
    { ...identity, versionId: '00000000-0000-4000-8000-000000000002' },
    { ...identity, platform: 'macos' as const },
    { ...identity, name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD' },
  ])('rejects transplant to another identity %j', (other) => {
    const { key, encrypted } = fixture();
    expect(() =>
      decryptDesktopResource(encrypted.ciphertext, key, other, encrypted)
    ).toThrow(DesktopVaultCryptoError);
  });

  it('rejects wrong data keys', () => {
    const { encrypted } = fixture();
    expect(() =>
      decryptDesktopResource(
        encrypted.ciphertext,
        randomBytes(32),
        identity,
        encrypted
      )
    ).toThrow(DesktopVaultCryptoError);
  });

  it.each(['iv', 'tag', 'bytes'])('rejects tampered %s', (field) => {
    const { key, encrypted } = fixture();
    const payload = JSON.parse(encrypted.ciphertext);
    const bytes = Buffer.from(payload[field], 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    payload[field] = bytes.toString('base64');
    expect(() =>
      decryptDesktopResource(JSON.stringify(payload), key, identity, encrypted)
    ).toThrow(DesktopVaultCryptoError);
  });

  it.each([
    { sha256: 'a'.repeat(64), size: 31 },
    { sha256: 'a'.repeat(64), size: 1 },
  ])('checks retained plaintext metadata %j', (metadata) => {
    const { key, encrypted } = fixture();
    expect(() =>
      decryptDesktopResource(encrypted.ciphertext, key, identity, metadata)
    ).toThrow(DesktopVaultCryptoError);
  });

  it.each(['not json', '{}', 'null', '{"version":2}'])(
    'sanitizes malformed envelope errors %s',
    (ciphertext) => {
      expect(() =>
        decryptDesktopResource(ciphertext, randomBytes(32), identity, {
          sha256: 'a'.repeat(64),
          size: 1,
        })
      ).toThrow('Desktop vault encrypted resource rejected');
    }
  );

  it.each([0, 1, 31, 33])('rejects key length %s', (length) => {
    expect(() =>
      encryptDesktopResource(
        Buffer.from('fixture'),
        Buffer.alloc(length),
        identity
      )
    ).toThrow(DesktopVaultCryptoError);
  });

  it.each([0, 2097153])('rejects plaintext length %s', (length) => {
    expect(() =>
      encryptDesktopResource(Buffer.alloc(length), randomBytes(32), identity)
    ).toThrow(DesktopVaultCryptoError);
  });
});
