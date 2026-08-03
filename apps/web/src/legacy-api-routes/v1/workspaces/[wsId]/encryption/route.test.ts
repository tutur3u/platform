import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  encryptWorkspaceKey: vi.fn(),
  generateWorkspaceKey: vi.fn(),
  getMasterKey: vi.fn(),
  isEncryptionEnabled: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/encryption', () => ({
  encryptWorkspaceKey: mocks.encryptWorkspaceKey,
  generateWorkspaceKey: mocks.generateWorkspaceKey,
  getMasterKey: mocks.getMasterKey,
  isEncryptionEnabled: mocks.isEncryptionEnabled,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

vi.mock('./utils', () => ({
  checkE2EEPermission: vi.fn(),
}));

const WS_ID = '22222222-2222-4222-8222-222222222222';

function createAdmin({
  existingKey = null,
  existingKeyAfterInsert = null,
  insertError = null,
}: {
  existingKey?: { id: string } | null;
  existingKeyAfterInsert?: { id: string } | null;
  insertError?: { code: string } | null;
} = {}) {
  let lookupCount = 0;
  const maybeSingle = vi.fn(async () => ({
    data: lookupCount++ === 0 ? existingKey : existingKeyAfterInsert,
    error: null,
  }));
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = maybeSingle;
  const insert = vi.fn(async () => ({ error: insertError }));
  const from = vi.fn(() => ({ ...query, insert }));

  return { admin: { from }, from, insert, maybeSingle };
}

async function postEncryption() {
  const { POST } = await import('./route');

  return POST(
    new Request(`http://localhost/api/v1/workspaces/${WS_ID}/encryption`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ wsId: WS_ID }) }
  );
}

describe('POST workspace encryption initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.isEncryptionEnabled.mockReturnValue(true);
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { auth: 'client' },
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: null,
      ok: true,
      type: 'MEMBER',
    });
    mocks.getMasterKey.mockReturnValue('master-key');
    mocks.generateWorkspaceKey.mockReturnValue('workspace-key');
    mocks.encryptWorkspaceKey.mockResolvedValue('encrypted-key');
  });

  it('allows a workspace member to create the initial key', async () => {
    const admin = createAdmin();
    mocks.createAdminClient.mockResolvedValue(admin.admin);

    const response = await postEncryption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadyExists: false,
      message: 'Encryption key created successfully',
      success: true,
    });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: { auth: 'client' },
      userId: 'user-1',
      wsId: WS_ID,
    });
    expect(admin.insert).toHaveBeenCalledWith({
      encrypted_key: 'encrypted-key',
      ws_id: WS_ID,
    });
  });

  it('rejects an authenticated non-member', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: null,
      ok: false,
    });

    const response = await postEncryption();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'You are not a member of this workspace',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns idempotent success when the key already exists', async () => {
    const admin = createAdmin({ existingKey: { id: 'key-1' } });
    mocks.createAdminClient.mockResolvedValue(admin.admin);

    const response = await postEncryption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadyExists: true,
      message: 'Encryption key already exists',
      success: true,
    });
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it('treats a concurrent key creation race as idempotent success', async () => {
    const admin = createAdmin({
      existingKeyAfterInsert: { id: 'key-created-concurrently' },
      insertError: { code: '23505' },
    });
    mocks.createAdminClient.mockResolvedValue(admin.admin);

    const response = await postEncryption();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadyExists: true,
      message: 'Encryption key already exists',
      success: true,
    });
    expect(admin.maybeSingle).toHaveBeenCalledTimes(2);
  });
});
