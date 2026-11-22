import { TAGGED_JPEG } from '@tuturuuu/storage-core/image-metadata-strip.fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageUploadPayload: vi.fn(),
  generateRandomUUID: vi.fn(() => 'upload-id'),
  requireWorkspaceExternalProjectAccess: vi.fn(),
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

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageUploadPayload:
    mocks.createWorkspaceStorageUploadPayload,
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

function createJsonRequest(payload: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/external-projects/assets/upload-url',
    {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

function createMultipartRequest(
  file = new File(['voice'], 'voice.wav', { type: 'audio/wav' })
) {
  const formData = new FormData();
  formData.set('collectionType', 'voice-reels');
  formData.set('entrySlug', 'demo');
  formData.set('file', file);

  const request = new Request(
    'http://localhost/api/v1/workspaces/workspace-1/external-projects/assets/upload-url',
    {
      headers: {
        'Content-Type': 'multipart/form-data; boundary=test',
      },
      method: 'POST',
    }
  );
  vi.spyOn(request, 'formData').mockResolvedValue(formData);

  return request;
}

async function postAssetUploadJson(payload: unknown) {
  const { POST } = await import('./route');

  return POST(createJsonRequest(payload), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

async function postAssetUploadMultipart(request = createMultipartRequest()) {
  const { POST } = await import('./route');

  return POST(request, {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

describe('external project asset upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.generateRandomUUID.mockClear();
    mocks.requireWorkspaceExternalProjectAccess.mockReset();
    mocks.createWorkspaceStorageUploadPayload.mockReset();
    mocks.uploadWorkspaceStorageFileDirect.mockReset();
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
      token: 'storage-token',
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath:
        'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
      path: 'external-projects/yoola/voice-reels/demo/voice.wav',
      provider: 'supabase',
    });
  });

  it('creates managed external-project signed upload URLs', async () => {
    const response = await postAssetUploadJson({
      collectionType: 'voice-reels',
      contentType: 'audio/wav',
      entrySlug: 'demo',
      filename: 'voice.wav',
      size: 5,
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
      token: 'storage-token',
    });
    expect(mocks.generateRandomUUID).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'voice.wav',
      {
        contentType: 'audio/wav',
        path: 'external-projects/yoola/voice-reels/demo',
        size: 5,
        upsert: true,
      }
    );
  });

  it('uploads multipart bodies directly with the real file size', async () => {
    const response = await postAssetUploadMultipart();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentSha256:
        'c57d7e92019708b614c90fa3685cd644f543a60153fb99ec9b67c381a245fb2a',
      contentType: 'audio/wav',
      filename: 'upload-id-voice.wav',
      fullPath:
        'workspace-1/external-projects/yoola/voice-reels/demo/voice.wav',
      metadataStripped: false,
      path: 'external-projects/yoola/voice-reels/demo/voice.wav',
      provider: 'supabase',
      size: 5,
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yoola/voice-reels/demo/upload-id-voice.wav',
      expect.any(Uint8Array),
      {
        contentType: 'audio/wav',
        upsert: false,
      }
    );
    const buffer = mocks.uploadWorkspaceStorageFileDirect.mock.calls[0]?.[2] as
      | Uint8Array
      | undefined;
    expect(buffer?.byteLength).toBe(5);
  });

  it.each([
    { contentType: 'image/jpeg', filename: 'photo.jpg' },
    { contentType: 'image/jpg', filename: 'photo.jpg' },
    { contentType: 'application/octet-stream', filename: 'photo.jpg' },
    { filename: 'photo.webp' },
  ])(
    'refuses signed uploads that would replace an image in place: %o',
    async (file) => {
      const response = await postAssetUploadJson({
        collectionType: 'gallery',
        entrySlug: 'demo',
        size: 5,
        upsert: true,
        ...file,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Replace images with a multipart upload',
      });
      expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
    }
  );

  it('refuses multipart images that do not parse', async () => {
    const response = await postAssetUploadMultipart(
      createMultipartRequest(
        new File([TAGGED_JPEG.subarray(0, 10)], 'photo.jpg', {
          type: 'image/jpeg',
        })
      )
    );

    expect(response.status).toBe(415);
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('stores multipart images without EXIF, GPS or XMP', async () => {
    const response = await postAssetUploadMultipart(
      createMultipartRequest(
        new File([TAGGED_JPEG], 'photo.jpg', {
          type: 'application/octet-stream',
        })
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const stored = mocks.uploadWorkspaceStorageFileDirect.mock.calls[0]?.[2] as
      | Uint8Array
      | undefined;
    expect(stored).toBeDefined();
    expect(stored!.byteLength).toBeLessThan(TAGGED_JPEG.byteLength);
    expect(Buffer.from(stored!).toString('latin1')).not.toMatch(
      /SerialABC123|TestCam|SecretCity/
    );
    expect(body).toMatchObject({
      metadataStripped: true,
      size: stored!.byteLength,
    });
    expect(body.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    {
      status: 413,
      message:
        'Workspace storage limit exceeded. Please free up space or upgrade your plan.',
    },
    { status: 409, message: 'File already exists' },
  ])(
    'returns multipart storage errors with status $status',
    async ({ message, status }) => {
      const { WorkspaceStorageError } =
        await import('@tuturuuu/storage-core/workspace-storage-provider');
      mocks.uploadWorkspaceStorageFileDirect.mockRejectedValueOnce(
        new WorkspaceStorageError(message, status)
      );

      const response = await postAssetUploadMultipart();

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: message });
    }
  );

  it('returns a generic 500 and logs only the unexpected multipart error', async () => {
    const request = createMultipartRequest();
    request.headers.set('Authorization', 'Bearer test-upload-token');
    const error = new Error('Unexpected storage failure');
    mocks.uploadWorkspaceStorageFileDirect.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const response = await postAssetUploadMultipart(request);

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to upload external project asset',
      });
      expect(log.mock.calls).toStrictEqual([
        ['Failed to upload external project asset', { error }],
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it('rejects unauthorized external-project uploads before signing', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await postAssetUploadJson({
      collectionType: 'voice-reels',
      contentType: 'audio/wav',
      entrySlug: 'demo',
      filename: 'voice.wav',
      size: 5,
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects missing or empty external-project upload sizes before signing', async () => {
    const response = await postAssetUploadJson({
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
    const response = await postAssetUploadJson({
      collectionType: 'voice-reels',
      contentType: 'application/octet-stream',
      entrySlug: 'demo',
      filename: 'script.sh',
      size: 7,
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: 'File type not allowed',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('randomizes signed upload filenames when overwrites are not requested', async () => {
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValueOnce({
      contentType: 'image/png',
      filename: 'upload-id-starter-signal.png',
      fullPath:
        'workspace-1/external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      path: 'external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      provider: 'r2',
      signedUrl: 'https://r2.example.com/upload',
    });

    const response = await postAssetUploadJson({
      collectionType: 'artworks',
      contentType: 'image/png',
      entrySlug: 'starter-signal',
      filename: 'starter-signal.png',
      size: 3,
    });

    expect(response.status).toBe(200);
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-starter-signal.png',
      {
        contentType: 'image/png',
        path: 'external-projects/yoola/artworks/starter-signal',
        size: 3,
        upsert: false,
      }
    );
  });

  it('creates Supabase signed upload URLs for external assets', async () => {
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValueOnce({
      contentType: 'image/png',
      filename: 'upload-id-starter-signal.png',
      fullPath:
        'workspace-1/external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      headers: {
        'Content-Type': 'image/png',
      },
      path: 'external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'storage-token',
    });
    const response = await postAssetUploadJson({
      collectionType: 'artworks',
      contentType: 'image/png',
      entrySlug: 'starter-signal',
      filename: 'starter-signal.png',
      size: 3,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contentType: 'image/png',
      filename: 'upload-id-starter-signal.png',
      fullPath:
        'workspace-1/external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      headers: {
        'Content-Type': 'image/png',
      },
      path: 'external-projects/yoola/artworks/starter-signal/upload-id-starter-signal.png',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'storage-token',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-starter-signal.png',
      {
        contentType: 'image/png',
        path: 'external-projects/yoola/artworks/starter-signal',
        size: 3,
        upsert: false,
      }
    );
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });
});
