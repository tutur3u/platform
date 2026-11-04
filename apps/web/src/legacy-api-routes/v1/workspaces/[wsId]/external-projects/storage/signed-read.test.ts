import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upload: vi.fn(),
  folder: vi.fn(),
  access: vi.fn(),
}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: mocks.access,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: mocks.read,
  uploadWorkspaceStorageFileDirect: mocks.upload,
  createWorkspaceStorageFolderObject: mocks.folder,
  WorkspaceStorageError: class extends Error {},
}));

import { GET, POST } from './route';

const params = { params: Promise.resolve({ wsId: 'workspace' }) };
function read(path: string) {
  return GET(
    new Request(
      `https://example.com/storage?filePath=${encodeURIComponent(path)}&expiresIn=999999&upsert=true`
    ),
    params
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockImplementation(async ({ mode }: { mode: string }) =>
    mode === 'read'
      ? {
          ok: true,
          normalizedWorkspaceId: 'workspace',
          binding: { adapter: 'custom' },
        }
      : { ok: false, response: new Response(null, { status: 403 }) }
  );
  mocks.read.mockResolvedValue('https://example.com/signed-read');
});
describe('editor media read boundary', () => {
  it.each(['image.png', 'external-projects/custom/image.png'])(
    'signs only the project object %s with a capped TTL and no upsert',
    async (path) => {
      expect((await read(path)).status).toBe(200);
      expect(mocks.read).toHaveBeenCalledWith(
        'workspace',
        'external-projects/custom/image.png',
        { expiresIn: 900, requireExists: true }
      );
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.folder).not.toHaveBeenCalled();
    }
  );
  it.each([
    'external-projects/other/image.png',
    'finance/invoice.pdf',
    'user-groups/private.pdf',
    '../finance/a',
    'images/../../finance/a',
    'images/%2e%2e/a',
    '/finance/a',
    'images\\..\\a',
  ])('denies out-of-prefix and normalized escape %s', async (path) => {
    expect((await read(path)).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not grant editor uploads or upserts', async () => {
    const response = await POST(
      new Request('https://example.com/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'folder', upsert: true }),
      }),
      params
    );
    expect(response.status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'manage' })
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.folder).not.toHaveBeenCalled();
  });
});
