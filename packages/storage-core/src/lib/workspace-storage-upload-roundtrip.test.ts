import { encodeStoragePath } from '@tuturuuu/utils/storage-path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  getSecrets: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (
    ...args: Parameters<typeof mocks.createDynamicAdminClient>
  ) => mocks.createDynamicAdminClient(...args),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

const decodeKey = (key: string) =>
  key.split('/').map(decodeURIComponent).join('/');

// Mirrors Supabase Storage: the server decodes the URL path into the object
// name and returns it as `fullPath` (`<bucket>/<name>`), while storage-js
// echoes the caller-supplied transport key back as `path`.
function fakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const calls = { upload: [] as string[], read: [] as string[] };
  const bucket = {
    upload: vi.fn(async (key: string, body: Uint8Array) => {
      calls.upload.push(key);
      objects.set(decodeKey(key), body);
      return {
        data: { path: key, fullPath: `workspaces/${decodeKey(key)}` },
        error: null,
      };
    }),
    download: vi.fn(async (key: string) => {
      calls.read.push(key);
      const body = objects.get(decodeKey(key));
      return body
        ? { data: new Blob([body]), error: null }
        : { data: null, error: { status: 404, message: 'not found' } };
    }),
    createSignedUrl: vi.fn(async (key: string) => {
      calls.read.push(key);
      return objects.has(decodeKey(key))
        ? {
            data: { signedUrl: `https://storage.test/sign/${key}` },
            error: null,
          }
        : { data: null, error: { status: 404, message: 'not found' } };
    }),
  };
  return { objects, calls, client: { storage: { from: vi.fn(() => bucket) } } };
}

describe('workspace storage upload round trip', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDynamicAdminClient.mockReset();
    mocks.getSecrets.mockReset().mockResolvedValue([]);
    vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    'docs?draft#final/file.pdf',
    'Báo cáo/Hồ sơ nhân viên.docx',
    '50% done/notes.txt',
  ])('returns the logical key for %j and reads it back', async (path) => {
    const storage = fakeStorage();
    mocks.createDynamicAdminClient.mockResolvedValue(storage.client);
    const {
      createWorkspaceStorageSignedReadUrl,
      downloadWorkspaceStorageObjectForProvider,
      uploadWorkspaceStorageFileDirectToProvider,
    } = await import('./workspace-storage-provider');

    const uploaded = await uploadWorkspaceStorageFileDirectToProvider(
      'ws-1',
      'supabase',
      path,
      new TextEncoder().encode('content'),
      { skipCapacityCheck: true, upsert: true }
    );

    expect(uploaded).toMatchObject({
      path,
      fullPath: `workspaces/ws-1/${path}`,
      provider: 'supabase',
    });
    expect(storage.calls.upload).toEqual([encodeStoragePath(`ws-1/${path}`)]);

    const downloaded = await downloadWorkspaceStorageObjectForProvider(
      'ws-1',
      'supabase',
      uploaded.path
    );
    expect(new TextDecoder().decode(downloaded.buffer)).toBe('content');

    await expect(
      createWorkspaceStorageSignedReadUrl('ws-1', uploaded.path, {
        provider: 'supabase',
      })
    ).resolves.toContain('https://storage.test/sign/');
    // Reads use the exact transport key the upload used: no double encoding.
    expect(storage.calls.read).toEqual([
      storage.calls.upload[0],
      storage.calls.upload[0],
    ]);
  });

  it('returns the logical folder key for delimiter and Vietnamese parents', async () => {
    const storage = fakeStorage();
    mocks.createDynamicAdminClient.mockResolvedValue(storage.client);
    const { createWorkspaceStorageFolderObject } = await import(
      './workspace-storage-provider'
    );

    await expect(
      createWorkspaceStorageFolderObject('ws-1', 'docs?draft#final', 'Tài liệu')
    ).resolves.toEqual({
      path: 'docs?draft#final/Tài liệu',
      fullPath: 'ws-1/docs?draft#final/Tài liệu/.emptyFolderPlaceholder',
      provider: 'supabase',
    });
    expect([...storage.objects.keys()]).toEqual([
      'ws-1/docs?draft#final/Tài liệu/.emptyFolderPlaceholder',
    ]);
  });
});
