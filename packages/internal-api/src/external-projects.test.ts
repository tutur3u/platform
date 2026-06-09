import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceExternalProjectAssetUploadUrl,
  createWorkspaceExternalProjectFieldDefinition,
  deleteWorkspaceExternalProjectFieldDefinition,
  listWorkspaceExternalProjectFieldDefinitions,
  updateWorkspaceExternalProjectFieldDefinition,
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

  it('uploads WebGL ZIP packages directly to the signed storage URL', async () => {
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
      'https://r2.example.com/signed-upload',
      expect.objectContaining({
        method: 'PUT',
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer storage-token',
          'Content-Type': 'application/zip',
        },
      })
    );
  });

  it('creates external-project media signed upload URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        contentType: 'image/png',
        filename: 'cover.png',
        fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
        headers: {
          'Content-Type': 'image/png',
        },
        path: 'external-projects/yoola/artworks/mine/cover.png',
        provider: 'supabase',
        signedUrl: 'https://storage.example.com/signed-upload',
        token: 'storage-token',
      })
    );

    const result = await createWorkspaceExternalProjectAssetUploadUrl(
      'ws-1',
      {
        adapter: 'yoola',
        collectionType: 'artworks',
        contentType: 'image/png',
        entrySlug: 'mine',
        filename: 'cover.png',
        size: 5,
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result).toEqual({
      contentType: 'image/png',
      filename: 'cover.png',
      fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
      headers: {
        'Content-Type': 'image/png',
      },
      path: 'external-projects/yoola/artworks/mine/cover.png',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/signed-upload',
      token: 'storage-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/assets/upload-url',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      collectionType: 'artworks',
      contentType: 'image/png',
      entrySlug: 'mine',
      filename: 'cover.png',
      size: 5,
    });
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json'
    );
  });

  it('uploads media assets directly to signed storage URLs', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const uploadProgress = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          contentType: 'image/png',
          fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
          headers: {
            'Content-Type': 'image/png',
          },
          path: 'external-projects/yoola/artworks/mine/cover.png',
          provider: 'supabase',
          signedUrl: 'https://storage.example.com/signed-upload',
          token: 'storage-token',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    const result = await uploadWorkspaceExternalProjectAssetFile(
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
        onUploadProgress: uploadProgress,
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/assets/upload-url',
      expect.objectContaining({
        body: JSON.stringify({
          collectionType: 'artworks',
          contentType: 'image/png',
          entrySlug: 'mine',
          filename: 'cover.png',
          size: 5,
          upsert: undefined,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.com/signed-upload',
      expect.objectContaining({
        body: file,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer storage-token',
          'Content-Type': 'image/png',
        },
        method: 'PUT',
      })
    );
    expect(uploadProgress).toHaveBeenCalledWith({
      loaded: file.size,
      percent: 100,
      total: file.size,
    });
    expect(result).toEqual({
      fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
      path: 'external-projects/yoola/artworks/mine/cover.png',
    });
  });

  it('uploads media assets with R2 header-only signed payloads', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          contentType: 'image/png',
          fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
          headers: {
            'Content-Type': 'image/png',
          },
          path: 'external-projects/yoola/artworks/mine/cover.png',
          provider: 'r2',
          signedUrl: 'https://r2.example.com/signed-upload',
        })
      )
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    const result = await uploadWorkspaceExternalProjectAssetFile(
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
      2,
      'https://r2.example.com/signed-upload',
      expect.objectContaining({
        body: file,
        cache: 'no-store',
        headers: {
          'Content-Type': 'image/png',
        },
        method: 'PUT',
      })
    );
    expect(result).toEqual({
      fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
      path: 'external-projects/yoola/artworks/mine/cover.png',
    });
  });
});

describe('external project field definition helpers', () => {
  it('uses workspace field-definition CRUD routes', async () => {
    const fieldDefinition = {
      id: 'field-1',
      key: 'medium',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse(fieldDefinition));

    await listWorkspaceExternalProjectFieldDefinitions(
      'ws-1',
      {
        collectionId: null,
        includeDisabled: true,
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await createWorkspaceExternalProjectFieldDefinition(
      'ws-1',
      {
        field_scope: 'profile_data',
        field_type: 'string',
        key: 'medium',
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await updateWorkspaceExternalProjectFieldDefinition(
      'ws-1',
      'field-1',
      {
        label: 'Medium',
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteWorkspaceExternalProjectFieldDefinition('ws-1', 'field-1', {
      baseUrl: 'https://web.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/field-definitions?collectionId=global&includeDisabled=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/field-definitions',
      expect.objectContaining({
        body: JSON.stringify({
          field_scope: 'profile_data',
          field_type: 'string',
          key: 'medium',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/field-definitions/field-1',
      expect.objectContaining({
        body: JSON.stringify({
          label: 'Medium',
        }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/field-definitions/field-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });
});
