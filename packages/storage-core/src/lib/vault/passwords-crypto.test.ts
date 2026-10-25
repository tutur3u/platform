import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEncryptedDataKey, decryptDataKey } from './crypto';
import { decodeValue, PASSWORDS_MAX_BYTES } from './passwords-contract';
import {
  openPasswordsFile,
  passwordsFilePath,
  sealPasswordsFile,
} from './passwords-crypto';
import { workspaceKeyWrapper } from './workspace-key-wrapper';

const context = () => ({
  wsId: randomUUID(),
  vaultId: randomUUID(),
  itemId: randomUUID(),
  fileId: randomUUID(),
  version: 1,
});

describe('Passwords encrypted files', () => {
  it('round-trips binary bytes with the existing mobile master-key wrapper', async () => {
    const wrapper = workspaceKeyWrapper('synthetic-passwords-test-master');
    const generated = await createEncryptedDataKey(wrapper);
    const key = await decryptDataKey(generated.encryptedDataKey, wrapper);
    const identity = context();
    const value = Buffer.from([0, 255, 17, 0, 192]);
    const sealed = sealPasswordsFile(value, key, identity);
    const opened = openPasswordsFile(
      sealed.ciphertext,
      sealed.encryptedMetadata,
      key,
      identity
    );
    expect(opened.equals(value)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(sealed.ciphertext)).alg).toBe(
      'A256GCM'
    );
    expect(passwordsFilePath(identity)).toBe(
      `${identity.wsId}/${identity.vaultId}/1/${identity.itemId}/${identity.fileId}`
    );
    opened.fill(0);
    key.fill(0);
    generated.dataKey.fill(0);
  });

  it.each(['wsId', 'vaultId', 'itemId', 'fileId', 'version'] as const)(
    'authenticates %s for file and metadata',
    (field) => {
      const key = randomBytes(32);
      const identity = context();
      const sealed = sealPasswordsFile(
        Buffer.from('synthetic secret'),
        key,
        identity
      );
      const different = {
        ...identity,
        [field]: field === 'version' ? 2 : randomUUID(),
      };
      expect(() =>
        openPasswordsFile(
          sealed.ciphertext,
          sealed.encryptedMetadata,
          key,
          different
        )
      ).toThrow('UNAVAILABLE');
      key.fill(0);
    }
  );

  it('rejects modified ciphertext, metadata substitution and unsupported envelopes', () => {
    const key = randomBytes(32);
    const identity = context();
    const sealed = sealPasswordsFile(Buffer.from('value'), key, identity);
    const envelope = JSON.parse(new TextDecoder().decode(sealed.ciphertext));
    envelope.ciphertext = Buffer.from('wrong').toString('base64');
    expect(() =>
      openPasswordsFile(
        Buffer.from(JSON.stringify(envelope)),
        sealed.encryptedMetadata,
        key,
        identity
      )
    ).toThrow('UNAVAILABLE');
    expect(() =>
      openPasswordsFile(
        sealed.ciphertext,
        new TextDecoder().decode(sealed.ciphertext),
        key,
        identity
      )
    ).toThrow('UNAVAILABLE');
    envelope.alg = 'unsupported';
    expect(() =>
      openPasswordsFile(
        Buffer.from(JSON.stringify(envelope)),
        sealed.encryptedMetadata,
        key,
        identity
      )
    ).toThrow('UNAVAILABLE');
    key.fill(0);
  });

  it('accepts empty bytes and rejects oversized or noncanonical input', () => {
    const key = randomBytes(32);
    const identity = context();
    const empty = sealPasswordsFile(Buffer.alloc(0), key, identity);
    expect(
      openPasswordsFile(
        empty.ciphertext,
        empty.encryptedMetadata,
        key,
        identity
      ).length
    ).toBe(0);
    expect(() =>
      sealPasswordsFile(Buffer.alloc(PASSWORDS_MAX_BYTES + 1), key, identity)
    ).toThrow('TOO_LARGE');
    expect(() => decodeValue('YQ')).toThrow('INVALID_INPUT');
    expect(() => decodeValue('YQ==', 0)).toThrow('TOO_LARGE');
    key.fill(0);
  });
});
