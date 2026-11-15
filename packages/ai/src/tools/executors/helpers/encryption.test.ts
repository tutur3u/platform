import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  enabled: vi.fn(),
  master: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  decryptEvents: vi.fn(),
}));
vi.mock('@tuturuuu/utils/encryption', () => ({
  isEncryptionEnabled: mocks.enabled,
  getMasterKey: mocks.master,
  decryptWorkspaceKey: mocks.decrypt,
  encryptCalendarEventFields: mocks.encrypt,
  decryptCalendarEvents: mocks.decryptEvents,
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

import {
  decryptEventsForTools,
  encryptEventFieldsForTools,
  resolveWorkspaceKeyForTools,
  WorkspaceEncryptionUnavailableError,
} from './encryption';

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

const missingMasterKey = () => {
  mocks.enabled.mockReturnValue(false);
  mocks.master.mockImplementation(() => {
    throw new Error('missing master key');
  });
};
const encryptedRow = {
  id: 'e1',
  title: 'ciphertext-title',
  description: 'ciphertext-description',
  location: 'ciphertext-location',
  is_encrypted: true,
  start_at: '2026-11-15T01:00:00Z',
};
const plainRow = {
  id: 'e2',
  title: 'Standup',
  description: 'Daily',
  location: null,
  is_encrypted: false,
};

describe('resolveWorkspaceKeyForTools', () => {
  it('reports none when the workspace has no key row, even without a master key', async () => {
    missingMasterKey();
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    await expect(resolveWorkspaceKeyForTools('workspace')).resolves.toEqual({
      status: 'none',
    });
  });
  it('reports unavailable when a key row exists but the master key is missing', async () => {
    missingMasterKey();
    await expect(
      resolveWorkspaceKeyForTools('workspace')
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it('reports unavailable when the key lookup fails', async () => {
    mocks.lookup.mockResolvedValue({
      data: null,
      error: new Error('lookup unavailable'),
    });
    await expect(
      resolveWorkspaceKeyForTools('workspace')
    ).resolves.toMatchObject({ status: 'unavailable' });
  });
  it('returns the key when the master key is present', async () => {
    await expect(
      resolveWorkspaceKeyForTools('workspace')
    ).resolves.toMatchObject({ status: 'available' });
  });
});

describe('non-strict writes fail closed', () => {
  it('refuses to encrypt when a key row exists but the master key is missing', async () => {
    missingMasterKey();
    await expect(
      encryptEventFieldsForTools(fields, 'workspace')
    ).rejects.toBeInstanceOf(WorkspaceEncryptionUnavailableError);
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it('refuses to encrypt when the key lookup fails', async () => {
    mocks.lookup.mockResolvedValue({
      data: null,
      error: new Error('lookup unavailable'),
    });
    await expect(
      encryptEventFieldsForTools(fields, 'workspace')
    ).rejects.toBeInstanceOf(WorkspaceEncryptionUnavailableError);
  });
  it('keeps plaintext writes for workspaces without a key row', async () => {
    missingMasterKey();
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    await expect(
      encryptEventFieldsForTools(fields, 'workspace')
    ).resolves.toEqual({ ...fields, is_encrypted: false });
  });
});

describe('decryptEventsForTools', () => {
  it('withholds encrypted fields and flags events when the master key is missing', async () => {
    missingMasterKey();
    const result = await decryptEventsForTools(
      [encryptedRow, plainRow],
      'workspace'
    );
    expect(result).toEqual([
      {
        ...encryptedRow,
        title: '',
        description: '',
        location: null,
        encryption_unavailable: true,
      },
      plainRow,
    ]);
    expect(JSON.stringify(result)).not.toContain('ciphertext');
    expect(mocks.decryptEvents).not.toHaveBeenCalled();
  });
  it('does not add fields the query did not select', async () => {
    missingMasterKey();
    const { description: _d, ...row } = encryptedRow;
    const [event] = await decryptEventsForTools([row], 'workspace');
    expect(event).not.toHaveProperty('description');
    expect(event?.encryption_unavailable).toBe(true);
  });
  it('returns plaintext events without a key lookup', async () => {
    missingMasterKey();
    await expect(
      decryptEventsForTools([plainRow], 'workspace')
    ).resolves.toEqual([plainRow]);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('decrypts with the workspace key when the master key is present', async () => {
    mocks.decryptEvents.mockReturnValue([
      { ...encryptedRow, title: 'Private meeting', is_encrypted: false },
    ]);
    const [event] = await decryptEventsForTools([encryptedRow], 'workspace');
    expect(event?.title).toBe('Private meeting');
    expect(event?.encryption_unavailable).toBeUndefined();
    expect(mocks.decryptEvents).toHaveBeenCalledWith(
      [encryptedRow],
      expect.any(Buffer)
    );
  });
});
