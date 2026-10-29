import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock(
  './workspace-storage-provider',
  async () => import('./storage-download-error')
);

const storage = vi.hoisted(() => ({
  markers: new Map<string, string>(),
  download: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({
    storage: {
      from: () => ({ download: storage.download, upload: storage.upload }),
    },
  }),
}));

import {
  createWorkspaceStorageExportToken,
  revokeWorkspaceStorageExportLinks,
  verifyWorkspaceStorageExportToken,
} from './workspace-storage-export-links';

const folder = {
  wsId: 'workspace-1',
  provider: 'supabase',
  folderPath: 'exports/site',
} as const;
const DAY = 86400;
function payload(token: string) {
  return JSON.parse(
    Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()
  );
}
function sign(value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', 'test-export-secret').update(body).digest('base64url')}`;
}

describe('Drive export link lifetime and revocation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    vi.stubEnv('DRIVE_EXPORT_SIGNING_SECRET', 'test-export-secret');
    vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', '');
    storage.markers.clear();
    storage.download.mockReset().mockImplementation(async (path: string) => {
      const marker = storage.markers.get(path);
      return marker === undefined
        ? { data: null, error: { status: 400, statusCode: '404' } }
        : { data: new Blob([marker]), error: null };
    });
    storage.upload
      .mockReset()
      .mockImplementation(
        async (path: string, value: string, options: { upsert: boolean }) => {
          if (!options.upsert && storage.markers.has(path))
            return { data: null, error: { statusCode: '409' } };
          storage.markers.set(path, value);
          return { data: { path }, error: null };
        }
      );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each(['', '0', '-1', 'invalid', 'Infinity'])(
    'uses seven days for config %s',
    async (value) => {
      vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', value);
      const token = await createWorkspaceStorageExportToken(folder);
      expect(payload(token).exp - payload(token).iat).toBe(7 * DAY);
    }
  );
  it('honors a positive override and fixes expiry at issuance', async () => {
    vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', '3600');
    const token = await createWorkspaceStorageExportToken(folder);
    expect(payload(token).exp - payload(token).iat).toBe(3600);
    vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', '2592000');
    vi.advanceTimersByTime(3600 * 1000);
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).rejects.toMatchObject({ status: 410 });
  });
  it('caps overrides at thirty days', async () => {
    vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', String(365 * DAY));
    const token = await createWorkspaceStorageExportToken(folder);
    expect(payload(token).exp - payload(token).iat).toBe(30 * DAY);
  });
  it('refuses default-expired links at the exact deadline', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    vi.advanceTimersByTime(7 * DAY * 1000);
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).rejects.toMatchObject({ status: 410 });
  });
  it('accepts a valid link', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).resolves.toMatchObject(folder);
  });
  it('revokes every existing link in a folder and allows new links', async () => {
    const first = await createWorkspaceStorageExportToken(folder);
    const second = await createWorkspaceStorageExportToken(folder);
    await revokeWorkspaceStorageExportLinks(folder);
    for (const token of [first, second]) {
      await expect(
        verifyWorkspaceStorageExportToken(token)
      ).rejects.toMatchObject({ status: 410 });
    }
    const next = await createWorkspaceStorageExportToken(folder);
    await expect(
      verifyWorkspaceStorageExportToken(next)
    ).resolves.toMatchObject(folder);
    await revokeWorkspaceStorageExportLinks(folder);
    await expect(verifyWorkspaceStorageExportToken(next)).rejects.toMatchObject(
      { status: 410 }
    );
  });
  it('keeps other folders and workspaces valid', async () => {
    const otherFolder = await createWorkspaceStorageExportToken({
      ...folder,
      folderPath: 'other',
    });
    const otherWorkspace = await createWorkspaceStorageExportToken({
      ...folder,
      wsId: 'workspace-2',
    });
    await revokeWorkspaceStorageExportLinks(folder);
    await expect(
      verifyWorkspaceStorageExportToken(otherFolder)
    ).resolves.toMatchObject({ folderPath: 'other' });
    await expect(
      verifyWorkspaceStorageExportToken(otherWorkspace)
    ).resolves.toMatchObject({ wsId: 'workspace-2' });
  });
  it('does not restore access when a marker is deleted', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    storage.markers.clear();
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).rejects.toMatchObject({ status: 410 });
    const replacement = await createWorkspaceStorageExportToken(folder);
    await expect(
      verifyWorkspaceStorageExportToken(replacement)
    ).resolves.toMatchObject(folder);
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).rejects.toMatchObject({ status: 410 });
  });
  it('preserves concurrent issuance without resetting the marker', async () => {
    const tokens = await Promise.all([
      createWorkspaceStorageExportToken(folder),
      createWorkspaceStorageExportToken(folder),
    ]);
    for (const token of tokens)
      await expect(
        verifyWorkspaceStorageExportToken(token)
      ).resolves.toMatchObject(folder);
    expect(storage.markers.size).toBe(1);
    expect(storage.download).toHaveBeenLastCalledWith(
      expect.stringContaining('/.tuturuuu/drive-export-revocations/'),
      { cacheNonce: expect.any(String) },
      { cache: 'no-store' }
    );
  });
  it('fails closed on marker read and write failures', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    storage.download.mockResolvedValue({
      data: null,
      error: { statusCode: '500' },
    });
    await expect(
      verifyWorkspaceStorageExportToken(token)
    ).rejects.toMatchObject({ status: 503 });
    storage.upload.mockResolvedValue({
      data: null,
      error: { statusCode: '500' },
    });
    await expect(
      revokeWorkspaceStorageExportLinks(folder)
    ).rejects.toMatchObject({ status: 503 });
  });
  it('rejects legacy and malformed signed payloads', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    for (const changes of [
      { v: 1 },
      { exp: undefined },
      { exp: null },
      { iat: null },
      { exp: payload(token).iat + 31 * DAY },
    ]) {
      await expect(
        verifyWorkspaceStorageExportToken(
          sign({ ...payload(token), ...changes })
        )
      ).rejects.toMatchObject({ status: 404 });
    }
  });
});
