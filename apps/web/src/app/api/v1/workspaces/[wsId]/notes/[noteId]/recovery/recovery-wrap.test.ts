import { encryptWorkspaceKey } from '@tuturuuu/utils/encryption';
import { describe, expect, it } from 'vitest';
import { unwrapNoteRecoveryKey, wrapNoteRecoveryKey } from './recovery-wrap';

const masterKey = 'test-master-key-with-ample-entropy-for-note-recovery';
const binding = { wsId: 'workspace', noteId: 'note', userId: 'owner' };
const secret = Buffer.alloc(32, 7).toString('base64');

describe('note recovery wrapping', () => {
  it('round trips only for the matching note owner and context', async () => {
    const wrapped = await wrapNoteRecoveryKey(secret, masterKey, binding);
    expect(wrapped.startsWith('nr1.')).toBe(true);
    expect(await unwrapNoteRecoveryKey(wrapped, masterKey, binding)).toBe(
      secret
    );
    await expect(
      unwrapNoteRecoveryKey(wrapped, masterKey, {
        ...binding,
        noteId: 'another-note',
      })
    ).rejects.toThrow();
    await expect(
      unwrapNoteRecoveryKey(`${wrapped.slice(0, -4)}AAAA`, masterKey, binding)
    ).rejects.toThrow();
  });

  it('reads older bound envelopes without creating new ones', async () => {
    const legacy = await encryptWorkspaceKey(
      Buffer.from(JSON.stringify({ ...binding, secret })),
      masterKey
    );
    expect(await unwrapNoteRecoveryKey(legacy, masterKey, binding)).toBe(
      secret
    );
    await expect(
      unwrapNoteRecoveryKey(legacy, masterKey, {
        ...binding,
        userId: 'another-owner',
      })
    ).rejects.toThrow('binding mismatch');
  });
});
