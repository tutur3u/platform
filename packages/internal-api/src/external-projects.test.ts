import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWorkspaceExternalProjectSyncManifest,
  createWorkspaceExternalProjectAssetUploadUrl,
  createWorkspaceExternalProjectFieldDefinition,
  deleteWorkspaceExternalProjectFieldDefinition,
  diffWorkspaceExternalProjectSyncManifest,
  getWorkspaceExternalProjectSyncSnapshot,
  listWorkspaceExternalProjectFieldDefinitions,
  listWorkspaceExternalProjectMedia,
  setupWorkspaceExternalProject,
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

  it('uploads media assets through the managed app route', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const uploadProgress = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
        path: 'external-projects/yoola/artworks/mine/cover.png',
      })
    );

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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/assets/upload-url',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const formData = init.body as FormData;
    expect(formData.get('collectionType')).toBe('artworks');
    expect(formData.get('contentType')).toBe('image/png');
    expect(formData.get('entrySlug')).toBe('mine');
    const uploadedFile = formData.get('file');
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe('cover.png');
    await expect((uploadedFile as File).text()).resolves.toBe('cover');
    expect(formData.get('upsert')).toBeNull();
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

  it('sends optional media upload flags through the managed app route', async () => {
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
        path: 'external-projects/yoola/artworks/mine/cover.png',
      })
    );

    const result = await uploadWorkspaceExternalProjectAssetFile(
      'ws-1',
      file,
      {
        adapter: 'yoola',
        collectionType: 'artworks',
        entrySlug: 'mine',
        upsert: true,
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/assets/upload-url',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const formData = init.body as FormData;
    expect(formData.get('upsert')).toBe('true');
    expect(result).toEqual({
      fullPath: 'ws-1/external-projects/yoola/artworks/mine/cover.png',
      path: 'external-projects/yoola/artworks/mine/cover.png',
    });
  });
});

describe('external project media helpers', () => {
  it('requests bounded media pages with stable filters', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        items: [],
        pageInfo: {
          hasMore: false,
          nextPage: null,
          page: 3,
          pageSize: 18,
          total: 0,
        },
        totals: { all: 0, audio: 0, image: 0, other: 0 },
      })
    );

    await listWorkspaceExternalProjectMedia(
      'ws 1',
      {
        attachment: 'unattached',
        page: 3,
        pageSize: 18,
        query: ' hero image ',
        type: 'image',
      },
      {
        baseUrl: 'https://web.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://web.example.com/api/v1/workspaces/ws%201/external-projects/assets?attachment=unattached&page=3&pageSize=18&type=image&q=hero+image',
      expect.objectContaining({ cache: 'no-store' })
    );
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

describe('external project sync helpers', () => {
  it('uses workspace setup, snapshot, diff, and apply routes', async () => {
    const manifest = {
      adapter: 'exocorpse',
      collections: [],
      project: {
        id: 'exocorpse',
      },
      version: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true }));
    const options = {
      baseUrl: 'https://web.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await setupWorkspaceExternalProject('ws-1', { manifest }, options);
    await getWorkspaceExternalProjectSyncSnapshot('ws-1', options);
    await diffWorkspaceExternalProjectSyncManifest(
      'ws-1',
      { manifest },
      options
    );
    await applyWorkspaceExternalProjectSyncManifest(
      'ws-1',
      {
        force: true,
        manifest,
      },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/setup',
      expect.objectContaining({
        body: JSON.stringify({ manifest }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/sync/snapshot',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/sync/diff',
      expect.objectContaining({
        body: JSON.stringify({ manifest }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://web.example.com/api/v1/workspaces/ws-1/external-projects/sync/apply',
      expect.objectContaining({
        body: JSON.stringify({
          force: true,
          manifest,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      if (init?.method === 'POST') {
        expect(headers.get('content-type')).toBe('application/json');
      }
    }
  });
});
