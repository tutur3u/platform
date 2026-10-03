import { Buffer } from 'node:buffer';
import { decryptField } from '@tuturuuu/utils/encryption';
import { expect, it, vi } from 'vitest';
import {
  createSealedMutationCodec,
  type MutationBinding,
} from './sealed-mutation';

vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));

const binding: MutationBinding = {
  operationId: '11111111-1111-4111-8111-111111111111',
  generation: '7',
  action: 'patch',
  baseETag: 'opaque-etag',
  identity: {
    wsId: '22222222-2222-4222-8222-222222222222',
    eventId: '33333333-3333-4333-8333-333333333333',
    connectionId: '44444444-4444-4444-8444-444444444444',
    authTokenId: '55555555-5555-4555-8555-555555555555',
    calendarId: 'calendar',
    providerEventId: 'provider-event',
  },
};
const payload = {
  providerPatch: {
    summary: 'Private title',
    description: 'Private description',
    location: 'Private location',
  },
  localPatch: { title: 'encrypted-storage-title', is_encrypted: true },
};
function fixture() {
  const key = Buffer.alloc(32, 17);
  const access = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const getKey = vi.fn().mockResolvedValue(key);
  return {
    key,
    access,
    getKey,
    codec: createSealedMutationCodec({ access, getKey }),
  };
}
it('persists only ciphertext and round-trips the established workspace field format', async () => {
  const f = fixture();
  const sealed = await f.codec.seal(binding, payload);
  expect(Object.keys(sealed).sort()).toEqual(['ciphertext', 'version']);
  for (const content of Object.values(payload.providerPatch))
    expect(JSON.stringify(sealed)).not.toContain(content);
  expect(await f.codec.open(binding, sealed)).toEqual(payload);
  expect(JSON.parse(decryptField(sealed.ciphertext, f.key))).toMatchObject({
    binding,
    payload,
  });
  expect(f.access.assertAllowed).toHaveBeenCalledTimes(2);
  expect(f.getKey).toHaveBeenNthCalledWith(2, binding.identity.wsId);
});
it('reauthorizes before every key lookup and rejects revoked access on replay', async () => {
  const f = fixture();
  const sealed = await f.codec.seal(binding, payload);
  f.access.assertAllowed.mockRejectedValue(new Error('revoked'));
  await expect(f.codec.open(binding, sealed)).rejects.toThrow('revoked');
  expect(f.getKey).toHaveBeenCalledTimes(1);
});
it('fails closed when the existing workspace key is unavailable', async () => {
  const f = fixture();
  const sealed = await f.codec.seal(binding, payload);
  f.getKey.mockResolvedValue(null);
  await expect(f.codec.seal(binding, payload)).rejects.toThrow(
    'Encrypted Google mutation is unavailable'
  );
  await expect(f.codec.open(binding, sealed)).rejects.toThrow(
    'Encrypted Google mutation is unavailable'
  );
});
it('never accepts plaintext or a malformed sealed envelope', async () => {
  const f = fixture();
  await expect(
    f.codec.open(binding, { version: 1, ciphertext: JSON.stringify(payload) })
  ).rejects.toThrow('Encrypted Google mutation is unavailable');
});
it('rejects ciphertext tampering and a different current workspace key', async () => {
  const f = fixture();
  const sealed = await f.codec.seal(binding, payload);
  const bytes = Buffer.from(sealed.ciphertext, 'base64');
  bytes[15] = bytes[15]! ^ 1;
  await expect(
    f.codec.open(binding, { ...sealed, ciphertext: bytes.toString('base64') })
  ).rejects.toThrow('Encrypted Google mutation is unavailable');
  f.getKey.mockResolvedValue(Buffer.alloc(32, 18));
  await expect(f.codec.open(binding, sealed)).rejects.toThrow(
    'Encrypted Google mutation is unavailable'
  );
});
it.each(['operationId', 'generation', 'action', 'baseETag'] as const)(
  'rejects replay with a different immutable %s',
  async (field) => {
    const f = fixture();
    const sealed = await f.codec.seal(binding, payload);
    const changed = {
      ...binding,
      [field]:
        field === 'action'
          ? 'delete'
          : field === 'operationId'
            ? '66666666-6666-4666-8666-666666666666'
            : '8',
    } as MutationBinding;
    await expect(f.codec.open(changed, sealed)).rejects.toThrow(
      'Encrypted Google mutation is unavailable'
    );
  }
);
it('rejects replay into another source/account identity', async () => {
  const f = fixture();
  const sealed = await f.codec.seal(binding, payload);
  await expect(
    f.codec.open(
      {
        ...binding,
        identity: { ...binding.identity, calendarId: 'other-calendar' },
      },
      sealed
    )
  ).rejects.toThrow('Encrypted Google mutation is unavailable');
});
