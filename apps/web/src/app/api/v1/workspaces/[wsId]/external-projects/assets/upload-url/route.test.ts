import { File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateRandomUUID: vi.fn(() => 'upload-id'),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  triggerWorkspaceStorageAutoExtract: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
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

vi.mock('@/lib/workspace-storage-auto-extract', () => ({
  triggerWorkspaceStorageAutoExtract: mocks.triggerWorkspaceStorageAutoExtract,
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: mocks.uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

function createUploadRequest({
  collectionType,
  entrySlug,
  file,
  upsert,
}: {
  collectionType: string;
  entrySlug: string;
  file: File;
  upsert?: string;
}) {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === 'collectionType') return collectionType;
        if (key === 'entrySlug') return entrySlug;
        if (key === 'file') return file;
        if (key === 'upsert') return upsert ?? null;
        return null;
      },
    }),
    url: 'http://localhost/api/v1/workspaces/workspace-1/external-projects/assets/upload-url',
  } as unknown as Request;
}

function createJsonRequest() {
  return {
    formData: async () => {
      throw new Error('Invalid form data');
    },
    url: 'http://localhost/api/v1/workspaces/workspace-1/external-projects/assets/upload-url',
  } as unknown as Request;
}

async function postAssetUploadFile(input: {
  collectionType: string;
  entrySlug: string;
  file: File;
  upsert?: string;
}) {
  const { POST } = await import('./route');

  return POST(createUploadRequest(input), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

async function postAssetUploadJson() {
  const { POST } = await import('./route');

  return POST(createJsonRequest(), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

describe('external project asset upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('File', NodeFile);
    mocks.generateRandomUUID.mockClear();
    mocks.requireWorkspaceExternalProjectAccess.mockReset();
    mocks.triggerWorkspaceStorageAutoExtract.mockReset();
    mocks.uploadWorkspaceStorageFileDirect.mockReset();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      binding: {
        adapter: 'yoola',
      },
      normalizedWorkspaceId: 'workspace-1',
      ok: true,
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath:
        'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
      path: 'external-projects/yoola/voice-reels/demo/voice.wav',
    });
    mocks.triggerWorkspaceStorageAutoExtract.mockResolvedValue({
      archivePath: 'external-projects/yoola/voice-reels/demo/voice.wav',
      message: 'Uploaded file is not a ZIP archive.',
      status: 'skipped',
    });
  });

  it('uploads managed external-project assets through the app server', async () => {
    const file = new NodeFile(['voice'], 'voice.wav', {
      type: 'audio/wav',
    }) as File;
    const response = await postAssetUploadFile({
      collectionType: 'voice-reels',
      entrySlug: 'demo',
      file,
      upsert: 'true',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      autoExtract: {
        archivePath: 'external-projects/yoola/voice-reels/demo/voice.wav',
        message: 'Uploaded file is not a ZIP archive.',
        status: 'skipped',
      },
      autoExtractError: null,
      contentType: 'audio/wav',
      data: {
        fullPath:
          'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
        path: 'external-projects/yoola/voice-reels/demo/voice.wav',
      },
      filename: 'voice.wav',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yoola/voice-reels/demo/voice.wav',
      expect.any(Uint8Array),
      {
        contentType: 'audio/wav',
        upsert: true,
      }
    );
    const uploadedBytes = mocks.uploadWorkspaceStorageFileDirect.mock
      .calls[0]?.[2] as Uint8Array;
    expect(uploadedBytes.byteLength).toBe(5);
  });

  it('rejects legacy signed upload URL JSON requests before storage writes', async () => {
    const response = await postAssetUploadJson();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid upload body',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects empty external-project uploads before storage writes', async () => {
    const response = await postAssetUploadFile({
      collectionType: 'voice-reels',
      entrySlug: 'demo',
      file: new NodeFile([], 'voice.wav', { type: 'audio/wav' }) as File,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'File is empty',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects disallowed external-project file types before storage writes', async () => {
    const response = await postAssetUploadFile({
      collectionType: 'voice-reels',
      entrySlug: 'demo',
      file: new NodeFile(['echo hi'], 'script.sh', {
        type: 'application/octet-stream',
      }) as File,
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: 'File type not allowed',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('randomizes filenames when overwrites are not requested', async () => {
    const response = await postAssetUploadFile({
      collectionType: 'artworks',
      entrySlug: 'starter-signal',
      file: new NodeFile(['png'], 'starter-signal.png', {
        type: 'image/png',
      }) as File,
    });

    expect(response.status).toBe(200);
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      expect.any(Uint8Array),
      {
        contentType: 'image/png',
        upsert: false,
      }
    );
  });
});
