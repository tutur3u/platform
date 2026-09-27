import { describe, expect, it } from 'vitest';
import { decryptNote, encryptNote, noteLockEnvelope } from './note-lock';

const sharedNote = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Cross platform' }] },
  ],
};

const crossPlatformEnvelope = {
  type: 'doc',
  attrs: {
    tuturuuuLock: {
      version: 1,
      salt: 'AQEBAQEBAQEBAQEBAQEBAQ==',
      nonce: 'AgICAgICAgICAgIC',
      ciphertext:
        '/kMAh5+gt8brz9XhQZhiqzUM29XOUDy1UJ607nmVAmBNcA2BHBFzMbKzWZ/1Pa5/MFN3l89npJwP9/sUg5xEtHyDG2ixX+MQnjZGvJcAM7phTUjNjbxDgqSmNabFIqEKoo44usycRQghvu5B0+g97WW8fg==',
    },
  },
  content: [],
};

describe('locked notes', () => {
  it('reads the shared AES-GCM format used by mobile', async () => {
    expect(
      await decryptNote(crossPlatformEnvelope, 'shared-passphrase')
    ).toEqual(sharedNote);
  });

  it('encrypts without storing the note in clear text', async () => {
    const encrypted = await encryptNote(sharedNote, 'shared-passphrase');
    expect(noteLockEnvelope(encrypted)).not.toBeNull();
    expect(JSON.stringify(encrypted)).not.toContain('Cross platform');
    expect(await decryptNote(encrypted, 'shared-passphrase')).toEqual(
      sharedNote
    );
    await expect(decryptNote(encrypted, 'incorrect')).rejects.toThrow();
  });
});
