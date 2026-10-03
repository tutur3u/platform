import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ColorOperationError } from './protocol';
import { createSealedJournalCodec } from './sealed-journal';

vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));
const bindingSchema = z
  .object({
    workspaceId: z.guid(),
    sourceConnection: z.guid(),
    destinationConnection: z.guid(),
    sourceETag: z.string(),
    generation: z.string(),
  })
  .strict();
const binding = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  sourceConnection: '33333333-3333-4333-8333-333333333333',
  destinationConnection: '44444444-4444-4444-8444-444444444444',
  sourceETag: 'source-version',
  generation: '9007199254740993',
};
function fixture() {
  const authorize = vi.fn().mockResolvedValue(undefined);
  const getKey = vi.fn().mockResolvedValue(Buffer.alloc(32, 9));
  return {
    authorize,
    getKey,
    codec: createSealedJournalCodec({
      binding: bindingSchema,
      payload: z.object({ privateBody: z.string() }).strict(),
      authorize,
      workspace: (current) => current.workspaceId,
      getKey,
    }),
  };
}
describe('shared encrypted provider journal', () => {
  it('authenticates both endpoints, original version and exact bigint generation', async () => {
    const f = fixture();
    const journal = await f.codec.seal(binding, {
      privateBody: 'Synthetic private body',
    });
    expect(JSON.stringify(journal)).not.toContain('Synthetic');
    await expect(f.codec.open(binding, journal)).resolves.toEqual({
      privateBody: 'Synthetic private body',
    });
    for (const changed of [
      { ...binding, destinationConnection: binding.sourceConnection },
      { ...binding, sourceConnection: binding.destinationConnection },
      { ...binding, sourceETag: 'new-version' },
      { ...binding, generation: '9007199254740994' },
    ])
      await expect(f.codec.open(changed, journal)).rejects.toMatchObject({
        reason: 'unavailable',
      });
    expect(f.getKey).toHaveBeenCalledWith(binding.workspaceId);
  });
  it('retains fresh authorization errors and does not request a key after revocation', async () => {
    const f = fixture();
    const journal = await f.codec.seal(binding, { privateBody: 'Synthetic' });
    f.authorize.mockRejectedValueOnce(
      new ColorOperationError('unauthorized', 'Revoked')
    );
    await expect(f.codec.open(binding, journal)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    expect(f.getKey).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown binding fields and corrupted ciphertext', async () => {
    const f = fixture();
    const invalidBinding = { ...binding, credential: 'Synthetic credential' };
    await expect(
      f.codec.seal(invalidBinding, { privateBody: 'Synthetic' })
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(f.authorize).not.toHaveBeenCalled();
    const journal = await f.codec.seal(binding, { privateBody: 'Synthetic' });
    const bytes = Buffer.from(journal.ciphertext, 'base64');
    bytes[13] = (bytes[13] ?? 0) ^ 1;
    await expect(
      f.codec.open(binding, {
        ...journal,
        ciphertext: bytes.toString('base64'),
      })
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
