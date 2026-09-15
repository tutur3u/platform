import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  enabled: vi.fn(),
  master: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));
vi.mock('@tuturuuu/utils/encryption', () => ({
  isEncryptionEnabled: mocks.enabled,
  getMasterKey: mocks.master,
  decryptWorkspaceKey: mocks.decrypt,
  encryptCalendarEventFields: mocks.encrypt,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.lookup,
    };
    return { from: () => query };
  },
}));

import { encryptEventFieldsForTools } from './encryption';

const fields = {
  title: 'Private meeting',
  description: 'Private evidence',
  location: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.master.mockReturnValue(Buffer.alloc(32));
  mocks.lookup.mockResolvedValue({
    data: { encrypted_key: 'wrapped' },
    error: null,
  });
  mocks.decrypt.mockResolvedValue(Buffer.alloc(32));
  mocks.encrypt.mockReturnValue({
    title: 'ciphertext',
    description: 'ciphertext',
  });
});
it('uses plaintext only when the workspace has no encryption key', async () => {
  mocks.lookup.mockResolvedValue({ data: null, error: null });
  await expect(
    encryptEventFieldsForTools(fields, 'workspace', true)
  ).resolves.toEqual({ ...fields, is_encrypted: false });
});
it('rejects key lookup, decryption and missing-master-key failures in strict mode', async () => {
  mocks.lookup.mockResolvedValueOnce({
    data: null,
    error: new Error('lookup unavailable'),
  });
  await expect(
    encryptEventFieldsForTools(fields, 'workspace', true)
  ).rejects.toThrow('lookup unavailable');
  mocks.decrypt.mockRejectedValueOnce(new Error('cannot decrypt'));
  await expect(
    encryptEventFieldsForTools(fields, 'workspace', true)
  ).rejects.toThrow('cannot decrypt');
  mocks.enabled.mockReturnValue(false);
  mocks.master.mockImplementation(() => {
    throw new Error('missing master key');
  });
  await expect(
    encryptEventFieldsForTools(fields, 'workspace', true)
  ).rejects.toThrow('missing master key');
  expect(mocks.encrypt).not.toHaveBeenCalled();
});
it('returns encrypted fields when the workspace key is available', async () => {
  await expect(
    encryptEventFieldsForTools(fields, 'workspace', true)
  ).resolves.toMatchObject({
    title: 'ciphertext',
    description: 'ciphertext',
    is_encrypted: true,
  });
});
