import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createEncryptedDataKey,
  decryptBytes,
  decryptDataKey,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
  redactLastFour,
} from './crypto';

const originalMasterKey = process.env.ENCRYPTION_MASTER_KEY;

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = originalMasterKey;
});

describe('mobile deployment crypto', () => {
  it('fails closed when ENCRYPTION_MASTER_KEY is missing', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    await expect(createEncryptedDataKey()).rejects.toThrow(
      'ENCRYPTION_MASTER_KEY'
    );
  });

  it('encrypts and decrypts scalar and binary payloads', async () => {
    process.env.ENCRYPTION_MASTER_KEY =
      'test-mobile-deployment-master-key-32-bytes-minimum';

    const { dataKey, encryptedDataKey } = await createEncryptedDataKey();
    const decryptedDataKey = await decryptDataKey(encryptedDataKey);
    expect(decryptedDataKey.equals(dataKey)).toBe(true);

    const encryptedSecret = encryptSecretValue(
      'secret-value',
      decryptedDataKey
    );
    expect(decryptSecretValue(encryptedSecret, decryptedDataKey)).toBe(
      'secret-value'
    );

    const encryptedBytes = encryptBytes(
      new TextEncoder().encode('file-bytes'),
      decryptedDataKey
    );
    expect(
      new TextDecoder().decode(decryptBytes(encryptedBytes, decryptedDataKey))
    ).toBe('file-bytes');
  });

  it('redacts only the last four characters', () => {
    expect(redactLastFour('abcdef')).toBe('cdef');
    expect(redactLastFour('abc')).toBe('abc');
  });
});
