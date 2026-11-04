import { createCipheriv, randomBytes } from 'node:crypto';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import { describe, expect, it } from 'vitest';
import {
  createEncryptedDataKey,
  decryptBytes,
  decryptDataKey,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
} from './crypto';
import { workspaceKeyWrapper } from './workspace-key-wrapper';

describe('portable vault envelopes', () => {
  // The first wrapper use derives its key with production scrypt parameters;
  // on shared CI runners that one-time derivation can exceed Vitest's default.
  it('uses the existing workspace master-key wrapper', async () => {
    const wrapper = workspaceKeyWrapper('synthetic-vault-test-master-key');
    const { dataKey, encryptedDataKey } = await createEncryptedDataKey(wrapper);
    const restored = await decryptDataKey(encryptedDataKey, wrapper);
    expect(restored.equals(dataKey)).toBe(true);
    expect(Buffer.from(encryptedDataKey, 'base64').length).toBe(60);
    expect(encryptedDataKey.includes(dataKey.toString('base64'))).toBe(false);
    await expect(
      decryptDataKey(
        encryptedDataKey,
        workspaceKeyWrapper('another-master-key')
      )
    ).rejects.toThrow('authentication failed');
    dataKey.fill(0);
    restored.fill(0);
  }, 30_000);

  it('decrypts the pre-extraction mobile scalar and file wire formats', () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const plaintext = Buffer.from('synthetic mobile compatibility fixture');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const scalar = Buffer.concat([iv, ciphertext, tag]).toString('base64');
    const file = Buffer.from(
      JSON.stringify({
        alg: 'A256GCM',
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      })
    );
    expect(decryptSecretValue(scalar, key) === plaintext.toString()).toBe(true);
    expect(decryptBytes(file, key).equals(plaintext)).toBe(true);
    expect(
      decryptSecretValue(encryptField(plaintext.toString(), key), key) ===
        plaintext.toString()
    ).toBe(true);
    expect(
      decryptField(encryptSecretValue(plaintext.toString(), key), key) ===
        plaintext.toString()
    ).toBe(true);
  });

  it('round-trips binary bytes and authenticates contextual identity', () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from([0, 255, 1, 0, 128]);
    const context = Buffer.from('passwords:v1:workspace:vault:version:item');
    const encrypted = encryptBytes(plaintext, key, context);
    expect(decryptBytes(encrypted, key, context).equals(plaintext)).toBe(true);
    expect(() => decryptBytes(encrypted, key)).toThrow('authentication failed');
    expect(() =>
      decryptBytes(encrypted, key, Buffer.from('other-item'))
    ).toThrow('authentication failed');
    expect(() => decryptBytes(encrypted, randomBytes(32), context)).toThrow(
      'authentication failed'
    );
  });

  it('uses independent nonces, including for empty binary values', () => {
    const key = randomBytes(32);
    const first = encryptBytes(new Uint8Array(), key);
    const second = encryptBytes(new Uint8Array(), key);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
    expect(decryptBytes(first, key).byteLength).toBe(0);
    expect(encryptSecretValue('', key)).toBe('');
    expect(decryptSecretValue('', key)).toBe('');
  });

  it('rejects malformed or unauthenticated payloads with bounded errors', () => {
    const key = randomBytes(32);
    for (const input of ['null', '{}', '"value"', '{', '{"alg":"A256GCM"}']) {
      expect(() => decryptBytes(Buffer.from(input), key)).toThrow('vault');
    }
    const scalar = Buffer.from(encryptSecretValue('synthetic', key), 'base64');
    scalar[12] = (scalar[12] ?? 0) ^ 1;
    expect(() => decryptSecretValue(scalar.toString('base64'), key)).toThrow(
      'authentication failed'
    );
    expect(() => encryptBytes(Buffer.alloc(0), Buffer.alloc(31))).toThrow(
      'data key is invalid'
    );
  });

  it('does not propagate wrapper errors that may contain sensitive data', async () => {
    const wrapper = {
      wrap: async () => {
        throw new Error('sensitive provider diagnostic');
      },
      unwrap: async () => {
        throw new Error('sensitive provider diagnostic');
      },
    };
    await expect(createEncryptedDataKey(wrapper)).rejects.toThrow(
      /^Vault key wrapping failed$/
    );
    await expect(decryptDataKey('synthetic', wrapper)).rejects.toThrow(
      /^Vault key authentication failed$/
    );
  });
});
