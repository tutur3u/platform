import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: mocks.deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider:
    mocks.getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider: mocks.resolveWorkspaceStorageProvider,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

describe('Valsea audio storage policy', () => {
  it('rejects oversized finalized audio and deletes the stored object', async () => {
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      provider: 'supabase',
    });
    mocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue({
      size: 11 * 1024 * 1024,
    });
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue({
      deleted: 1,
      provider: 'supabase',
    });

    const { validateFinalizedValseaAudioUpload } = await import(
      './valsea-audio-storage-policy'
    );

    await expect(
      validateFinalizedValseaAudioUpload({
        path: 'education/valsea/audio/lesson.webm',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      ok: false,
      message: 'Audio file must be 10 MB or smaller',
      status: 413,
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'workspace-1',
      'education/valsea/audio/lesson.webm'
    );
  });
});
