import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  uploadWorkspaceExternalProjectAssetFile,
  uploadWorkspaceExternalProjectWebglPackageFile,
} from './external-projects';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('external project upload helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uploads WebGL ZIP packages through the configured web proxy when provided', async () => {
    const file = new File(['zip'], 'Mine Blast WebGL.zip', {
      type: 'application/zip',
    });
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', 'https://web.example.com');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          archivePath:
            'external-projects/yoola/games/mine/webgl-packages/upload.zip',
          fullPath:
            'ws-1/external-projects/yoola/games/mine/webgl-packages/upload.zip',
          path: 'external-projects/yoola/games/mine/webgl-packages/upload.zip',
          proxyUploadUrl:
            '/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fmine%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip',
          signedUrl: 'https://r2.example.com/signed-upload',
          token: 'storage-token',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce(
        createJsonResponse({
          artifact: {
            archivePath:
              'external-projects/yoola/games/mine/webgl-packages/upload.zip',
            assetUrls: {},
            entryRelativePath: 'index.html',
            entryUrl:
              '/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/index.html',
            files: [],
            kind: 'webgl-package',
            provider: 'r2',
            rootPath:
              'external-projects/yoola/games/mine/webgl-packages/upload',
            version: 1,
          },
          asset: {
            id: 'asset-1',
          },
          extract: {
            files: 1,
            folders: 0,
            message: 'ok',
          },
        })
      );

    await uploadWorkspaceExternalProjectWebglPackageFile(
      'ws-1',
      file,
      {
        entryId: '00000000-0000-4000-8000-000000000001',
      },
      {
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fmine%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip',
      expect.objectContaining({
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/zip',
        },
      })
    );

    const uploadOptions = fetchMock.mock.calls[1]?.[1] as {
      headers?: Record<string, string>;
    };
    expect(uploadOptions.headers?.Authorization).toBeUndefined();
  });

  it('uploads media assets through the workspace Drive signed-upload endpoints', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          fullPath:
            'ws-1/external-projects/yoola/artworks/mine/upload-cover.png',
          path: 'external-projects/yoola/artworks/mine/upload-cover.png',
          signedUrl: 'https://storage.example.com/signed-upload',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce(createJsonResponse({}));

    await uploadWorkspaceExternalProjectAssetFile(
      'ws-1',
      file,
      {
        adapter: 'yoola',
        collectionType: 'artworks',
        entrySlug: 'mine',
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.example.com/api/v1/workspaces/ws-1/storage/upload-url',
      expect.objectContaining({
        body: JSON.stringify({
          filename: 'cover.png',
          path: 'external-projects/yoola/artworks/mine',
          size: file.size,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://web.example.com/api/v1/workspaces/ws-1/storage/finalize-upload',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    const finalizeOptions = fetchMock.mock.calls[2]?.[1] as { body?: string };
    expect(JSON.parse(finalizeOptions.body ?? '{}')).toEqual({
      contentType: 'image/png',
      originalFilename: 'cover.png',
      path: 'external-projects/yoola/artworks/mine/upload-cover.png',
    });
  });
});
