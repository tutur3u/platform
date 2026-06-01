import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageUploadPayload: vi.fn(),
  generateRandomUUID: vi.fn(() => 'upload-id'),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@tuturuuu/utils/uuid-helper', () => ({
  generateRandomUUID: mocks.generateRandomUUID,
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload:
    mocks.createWorkspaceStorageUploadPayload,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

async function postAssetUploadUrl(payload: Record<string, unknown>) {
  const { POST } = await import('./route');

  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/workspace-1/external-projects/assets/upload-url',
      {
        body: JSON.stringify(payload),
        method: 'POST',
      }
    ),
    { params: Promise.resolve({ wsId: 'workspace-1' }) }
  );
}

describe('external project asset upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createWorkspaceStorageUploadPayload.mockReset();
    mocks.generateRandomUUID.mockClear();
    mocks.requireWorkspaceExternalProjectAccess.mockReset();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      binding: {
        adapter: 'yoola',
      },
      normalizedWorkspaceId: 'workspace-1',
      ok: true,
    });
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      contentType: 'audio/wav',
      filename: 'voice.wav',
      fullPath:
        'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
      headers: {
        'Content-Type': 'audio/wav',
      },
      path: 'external-projects/yoola/voice-reels/demo/voice.wav',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
  });

  it('creates managed external-project upload URLs through the workspace storage provider', async () => {
    const response = await postAssetUploadUrl({
      collectionType: 'voice-reels',
      contentType: 'audio/wav',
      entrySlug: 'demo',
      filename: 'voice.wav',
      size: 128,
      upsert: true,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentType: 'audio/wav',
      filename: 'voice.wav',
      fullPath:
        'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
      headers: {
        'Content-Type': 'audio/wav',
      },
      path: 'external-projects/yoola/voice-reels/demo/voice.wav',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'voice.wav',
      {
        contentType: 'audio/wav',
        path: 'external-projects/yoola/voice-reels/demo',
        size: 128,
        upsert: true,
      }
    );
  });

  it('rejects empty external-project uploads before signing', async () => {
    const response = await postAssetUploadUrl({
      collectionType: 'voice-reels',
      contentType: 'audio/wav',
      entrySlug: 'demo',
      filename: 'voice.wav',
      size: 0,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'File is empty',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects disallowed external-project file types before signing', async () => {
    const response = await postAssetUploadUrl({
      collectionType: 'voice-reels',
      contentType: 'application/octet-stream',
      entrySlug: 'demo',
      filename: 'script.sh',
      size: 128,
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: 'File type not allowed',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('randomizes filenames when overwrites are not requested', async () => {
    const response = await postAssetUploadUrl({
      collectionType: 'artworks',
      contentType: 'image/png',
      entrySlug: 'starter-signal',
      filename: 'starter-signal.png',
      size: 128,
    });

    expect(response.status).toBe(200);
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-starter-signal.png',
      {
        contentType: 'image/png',
        path: 'external-projects/yoola/artworks/starter-signal',
        size: 128,
        upsert: false,
      }
    );
  });
});
