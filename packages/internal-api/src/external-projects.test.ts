import { describe, expect, it, vi } from 'vitest';
import { uploadWorkspaceExternalProjectWebglPackageFile } from './external-projects';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('external project upload helpers', () => {
  it('uploads WebGL ZIP packages through the same-origin proxy when provided', async () => {
    const file = new File(['zip'], 'Mine Blast WebGL.zip', {
      type: 'application/zip',
    });
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
        baseUrl: 'https://cms.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://cms.example.com/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fmine%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip',
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
});
