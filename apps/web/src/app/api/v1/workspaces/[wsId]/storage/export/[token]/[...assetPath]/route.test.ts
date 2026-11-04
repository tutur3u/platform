// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<typeof import('next/server')>('next/server')),
  connection: async () => undefined,
}));
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
  marker: '',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({
    storage: {
      from: () => ({ download: mocks.download, upload: mocks.upload }),
    },
  }),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', async () => ({
  ...(await import('@tuturuuu/storage-core/storage-download-error')),
  createWorkspaceStorageSignedReadUrl: mocks.sign,
}));

import {
  createWorkspaceStorageExportToken,
  revokeWorkspaceStorageExportLinks,
} from '@tuturuuu/storage-core/workspace-storage-export-links';
import { GET } from './route';

const folder = {
  wsId: 'workspace-1',
  folderPath: 'exports/site',
  provider: 'supabase',
} as const;
async function fetchAsset(token: string, wsId: string = folder.wsId) {
  return GET(new Request('https://web.example.test/export'), {
    params: Promise.resolve({ wsId, token, assetPath: ['index.html'] }),
  });
}

describe('export asset fetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    vi.stubEnv('DRIVE_EXPORT_SIGNING_SECRET', 'route-test-export-secret');
    vi.stubEnv('DRIVE_EXPORT_LINK_TTL_SECONDS', '60');
    mocks.marker = '';
    mocks.download
      .mockReset()
      .mockImplementation(async () =>
        mocks.marker
          ? { data: new Blob([mocks.marker]), error: null }
          : { data: null, error: { statusCode: '404' } }
      );
    mocks.upload
      .mockReset()
      .mockImplementation(async (_path: string, value: string) => {
        mocks.marker = value;
        return { error: null };
      });
    mocks.sign
      .mockReset()
      .mockResolvedValue('https://storage.example.test/read');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it('redirects a valid link to a signed read', async () => {
    const response = await fetchAsset(
      await createWorkspaceStorageExportToken(folder)
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://storage.example.test/read'
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(
      folder.wsId,
      'exports/site/index.html',
      { expiresIn: 900, provider: 'supabase' }
    );
  });
  it('returns 410 without signing or exposing data for an expired link', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    vi.advanceTimersByTime(60_000);
    const response = await fetchAsset(token);
    expect(response.status).toBe(410);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ message: 'Export link expired.' });
  });
  it('returns 410 without signing or exposing data for a revoked link', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    await revokeWorkspaceStorageExportLinks(folder);
    const response = await fetchAsset(token);
    expect(response.status).toBe(410);
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ message: 'Export link revoked.' });
  });
  it('rejects a token presented under another workspace', async () => {
    const response = await fetchAsset(
      await createWorkspaceStorageExportToken(folder),
      'workspace-2'
    );
    expect(response.status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('fails closed when revocation storage is unavailable', async () => {
    const token = await createWorkspaceStorageExportToken(folder);
    mocks.download.mockResolvedValue({
      data: null,
      error: { statusCode: '500' },
    });
    expect((await fetchAsset(token)).status).toBe(503);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
