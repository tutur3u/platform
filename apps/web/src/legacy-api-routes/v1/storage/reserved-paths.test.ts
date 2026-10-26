import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_DRIVE_RESOURCE_PATHS } from '@/lib/private-drive-paths.test-fixture';

vi.mock('server-only', () => ({}));

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const RESERVED_FILE_PATH =
  '.tuturuuu/mobile-deployment-vault/production/android/google-services.ciphertext.json';
const RESERVED_PARENT_PATH =
  '.tuturuuu/mobile-deployment-vault/production/android';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
}));

type ParseableSchema = {
  parse(data: unknown): unknown;
};
type RouteHandler = (
  request: Request,
  context: {
    context: {
      keyId: string;
      wsId: string;
    };
    params: unknown;
  }
) => Promise<Response> | Response;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: mocks.createDynamicAdminClient,
}));

vi.mock('@/lib/api-middleware', () => ({
  createErrorResponse: (
    error: string,
    message: string,
    status: number,
    code?: string
  ) =>
    Response.json(
      {
        code,
        error,
        message,
      },
      { status }
    ),
  validateQueryParams: (request: Request, schema: ParseableSchema) => {
    const url = new URL(request.url);
    return { data: schema.parse(Object.fromEntries(url.searchParams)) };
  },
  validateRequestBody: async (request: Request, schema: ParseableSchema) =>
    ({
      data: schema.parse(await request.json()),
    }) as const,
  withApiAuth:
    (handler: RouteHandler) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, {
        context: {
          keyId: 'api-key-1',
          wsId: ROOT_WORKSPACE_ID,
        },
        params: routeContext?.params ? await routeContext.params : {},
      }),
}));

function createJsonRequest(method: string, path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    method,
  });
}

function expectReserved(response: Response) {
  expect(response.status).toBe(403);
  return expect(response.json()).resolves.toMatchObject({
    code: 'STORAGE_RESERVED_PATH',
  });
}

describe('API-key storage reserved mobile deployment paths', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDynamicAdminClient.mockReset();
  });

  it('rejects listing the mobile deployment vault prefix', async () => {
    const { GET } = await import('@/app/api/v1/storage/list/route');

    const response = await GET(
      new Request(
        `http://localhost/api/v1/storage/list?path=${encodeURIComponent(RESERVED_PARENT_PATH)}`
      ) as Parameters<typeof GET>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('preserves raw URL delimiters when listing legacy paths', async () => {
    const list = vi.fn().mockResolvedValue({ data: [], error: null });
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: { from: vi.fn(() => ({ list })) },
    });
    const { GET } = await import('@/app/api/v1/storage/list/route');
    const path = 'docs?draft#final';
    const response = await GET(
      new Request(
        `http://localhost/api/v1/storage/list?path=${encodeURIComponent(path)}`
      ) as Parameters<typeof GET>[0]
    );

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(
      `${ROOT_WORKSPACE_ID}/docs?draft#final`,
      expect.any(Object)
    );
  });

  it('encodes raw URL delimiters before direct upload requests', async () => {
    // storage-js echoes the supplied transport key; the server decodes it.
    const upload = vi.fn(async (key: string) => ({
      data: { path: key, fullPath: `workspaces/${decodeURIComponent(key)}` },
      error: null,
    }));
    const download = vi.fn(async () => ({
      data: new Blob(['file'], { type: 'application/pdf' }),
      error: null,
    }));
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: { from: vi.fn(() => ({ download, upload })) },
    });
    const { POST } = await import('./upload/route');
    const file = {
      arrayBuffer: async () => new TextEncoder().encode('file').buffer,
      name: 'file.pdf',
      size: 4,
      type: 'application/pdf',
    } as File;
    const response = await POST({
      formData: async () => ({
        get: (key: string) =>
          key === 'file' ? file : key === 'path' ? 'docs?draft#final' : null,
      }),
      url: 'http://localhost/api/v1/storage/upload',
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      `${ROOT_WORKSPACE_ID}/docs%3Fdraft%23final/file.pdf`,
      expect.any(Uint8Array),
      expect.any(Object)
    );
    const { data } = await response.json();
    expect(data).toEqual({
      path: 'docs?draft#final/file.pdf',
      fullPath: `workspaces/${ROOT_WORKSPACE_ID}/docs?draft#final/file.pdf`,
    });

    // The returned key reads back with the same transport key, not %25-encoded.
    const { GET } = await import(
      '@/app/api/v1/storage/download/[...path]/route'
    );
    const read = await GET(
      new Request(
        'http://localhost/api/v1/storage/download/file'
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ path: data.path.split('/') }) }
    );
    expect(read.status).toBe(200);
    expect(download).toHaveBeenCalledWith(upload.mock.calls[0]![0], undefined);
  });

  it('rejects signed uploads into the mobile deployment vault prefix', async () => {
    const { POST } = await import('./upload-url/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/upload-url', {
        filename: 'google-services.ciphertext.json',
        path: RESERVED_PARENT_PATH,
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    '../22222222-2222-4222-8222-222222222222/private',
    '%2e%2e/22222222-2222-4222-8222-222222222222/private',
    '%2E%2E/22222222-2222-4222-8222-222222222222/private',
    '%2e./22222222-2222-4222-8222-222222222222/private',
    '.%2e/22222222-2222-4222-8222-222222222222/private',
    '%2f..%5c22222222-2222-4222-8222-222222222222/private',
    'https://storage.test/avatars/private',
    'avatars\\private',
  ])(
    'rejects unsafe signed-upload path %s before admin access',
    async (path) => {
      const { POST } = await import('./upload-url/route');
      const response = await POST(
        createJsonRequest('POST', '/api/v1/storage/upload-url', {
          filename: 'image.png',
          path,
        }) as Parameters<typeof POST>[0]
      );

      expect(response.status).toBe(400);
      expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
    }
  );

  it('creates a signed upload for a normal relative path', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.test/upload', token: 'test-token' },
      error: null,
    });
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    });
    const { POST } = await import('./upload-url/route');
    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/upload-url', {
        filename: 'image.png',
        path: 'whiteboards/board-1',
      }) as Parameters<typeof POST>[0]
    );

    expect(response.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      `${ROOT_WORKSPACE_ID}/whiteboards/board-1/image.png`,
      { upsert: false }
    );
  });

  it('signs uploads with the same encoded key that downloads read', async () => {
    const createSignedUploadUrl = vi.fn(async (key: string) => ({
      data: { signedUrl: `https://storage.test/upload/${key}`, token: 't' },
      error: null,
    }));
    const download = vi.fn(async () => ({
      data: new Blob(['image'], { type: 'image/png' }),
      error: null,
    }));
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: { from: vi.fn(() => ({ createSignedUploadUrl, download })) },
    });
    const { POST } = await import('./upload-url/route');
    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/upload-url', {
        filename: 'image.png',
        path: 'docs/literal%41',
      }) as Parameters<typeof POST>[0]
    );

    expect(response.status).toBe(200);
    const signedKey = createSignedUploadUrl.mock.calls[0]![0];
    expect(signedKey).toBe(`${ROOT_WORKSPACE_ID}/docs/literal%2541/image.png`);
    await expect(response.json()).resolves.toMatchObject({
      data: { path: `${ROOT_WORKSPACE_ID}/docs/literal%41/image.png` },
    });

    const { GET } = await import(
      '@/app/api/v1/storage/download/[...path]/route'
    );
    const read = await GET(
      new Request(
        'http://localhost/api/v1/storage/download/file'
      ) as Parameters<typeof GET>[0],
      {
        params: Promise.resolve({
          path: ['docs', 'literal%41', 'image.png'],
        }),
      }
    );
    expect(read.status).toBe(200);
    expect(download).toHaveBeenCalledWith(signedKey, undefined);
  });

  it('rejects direct uploads into the mobile deployment vault prefix', async () => {
    const { POST } = await import('./upload/route');
    const file = {
      arrayBuffer: async () => new TextEncoder().encode('secret').buffer,
      name: 'google-services.ciphertext.json',
      size: 6,
      type: 'application/json',
    } as File;
    const request = {
      formData: async () => ({
        get: (key: string) => {
          if (key === 'file') return file;
          if (key === 'path') return RESERVED_PARENT_PATH;
          return null;
        },
      }),
      url: 'http://localhost/api/v1/storage/upload',
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(request);

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('rejects downloads from the mobile deployment vault prefix', async () => {
    const { GET } = await import(
      '@/app/api/v1/storage/download/[...path]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/storage/download/vault'
      ) as Parameters<typeof GET>[0],
      {
        params: Promise.resolve({ path: RESERVED_FILE_PATH.split('/') }),
      }
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('rejects deletes from the mobile deployment vault prefix', async () => {
    const { DELETE } = await import('./delete/route');

    const response = await DELETE(
      createJsonRequest('DELETE', '/api/v1/storage/delete', {
        paths: [RESERVED_FILE_PATH],
      }) as Parameters<typeof DELETE>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('rejects folder creation under the reserved .tuturuuu namespace', async () => {
    const { POST } = await import('./folders/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/folders', {
        name: 'mobile-deployment-vault',
        path: '.tuturuuu',
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('preserves raw URL delimiters in legacy folder parent paths', async () => {
    const upload = vi.fn(async (key: string) => ({
      data: { path: key },
      error: null,
    }));
    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: { from: vi.fn(() => ({ upload })) },
    });
    const { POST } = await import('./folders/route');
    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/folders', {
        name: 'safe',
        path: 'docs?draft#final',
      }) as Parameters<typeof POST>[0]
    );

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      `${ROOT_WORKSPACE_ID}/docs%3Fdraft%23final/safe/.emptyFolderPlaceholder`,
      expect.any(Uint8Array),
      expect.any(Object)
    );
    await expect(response.json()).resolves.toMatchObject({
      data: {
        fullPath: `${ROOT_WORKSPACE_ID}/docs?draft#final/safe/.emptyFolderPlaceholder`,
      },
    });
  });

  it('rejects signed share URLs for the mobile deployment vault prefix', async () => {
    const { POST } = await import('@/app/api/v1/storage/share/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/share', {
        path: RESERVED_FILE_PATH,
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('rejects batch signed share URLs that include the mobile deployment vault prefix', async () => {
    const { POST } = await import('@/app/api/v1/storage/share-batch/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/share-batch', {
        paths: ['public/readme.txt', RESERVED_FILE_PATH],
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

describe('API-key Drive cannot expose private chat objects', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it.each(PRIVATE_DRIVE_RESOURCE_PATHS)(
    'rejects list, download, share, batch signing and delete for %s',
    async (path) => {
      const list = await import('@/app/api/v1/storage/list/route');
      const download = await import(
        '@/app/api/v1/storage/download/[...path]/route'
      );
      const share = await import('@/app/api/v1/storage/share/route');
      const batch = await import('@/app/api/v1/storage/share-batch/route');
      const del = await import('./delete/route');
      const responses = [
        await list.GET(
          new Request(
            `http://localhost/api/v1/storage/list?path=${encodeURIComponent(path)}`
          ) as Parameters<typeof list.GET>[0]
        ),
        await download.GET(
          new Request(
            'http://localhost/api/v1/storage/download/object'
          ) as Parameters<typeof download.GET>[0],
          { params: Promise.resolve({ path: path.split('/') }) }
        ),
        await share.POST(
          createJsonRequest('POST', '/api/v1/storage/share', {
            path,
          }) as Parameters<typeof share.POST>[0]
        ),
        await batch.POST(
          createJsonRequest('POST', '/api/v1/storage/share-batch', {
            paths: ['documents/own.pdf', path],
          }) as Parameters<typeof batch.POST>[0]
        ),
      ];
      responses.push(
        await del.DELETE(
          createJsonRequest('DELETE', '/api/v1/storage/delete', {
            paths: [path],
          }) as Parameters<typeof del.DELETE>[0]
        )
      );
      for (const response of responses) expect(response.status).toBe(403);
      expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
    }
  );
});

it('allows ordinary mira notes to be listed, shared, downloaded and deleted', async () => {
  const list = vi.fn(async () => ({
    data: [{ id: 'notes', name: 'notes.txt', metadata: { size: 5 } }],
    error: null,
  }));
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: 'https://storage.test/mira-notes' },
    error: null,
  }));
  const download = vi.fn(async () => ({
    data: new Blob(['notes'], { type: 'text/plain' }),
    error: null,
  }));
  const remove = vi.fn(async () => ({
    data: [{ name: 'notes.txt' }],
    error: null,
  }));
  mocks.createDynamicAdminClient.mockResolvedValue({
    storage: { from: () => ({ list, createSignedUrl, download, remove }) },
  });
  const listing = await import('@/app/api/v1/storage/list/route');
  const share = await import('@/app/api/v1/storage/share/route');
  const batch = await import('@/app/api/v1/storage/share-batch/route');
  const read = await import('@/app/api/v1/storage/download/[...path]/route');
  const del = await import('./delete/route');
  expect(
    (
      await listing.GET(
        new Request(
          'http://localhost/api/v1/storage/list?path=mira'
        ) as Parameters<typeof listing.GET>[0]
      )
    ).status
  ).toBe(200);
  expect(
    (
      await share.POST(
        createJsonRequest('POST', '/api/v1/storage/share', {
          path: 'mira/notes.txt',
        }) as Parameters<typeof share.POST>[0]
      )
    ).status
  ).toBe(200);
  expect(
    (
      await batch.POST(
        createJsonRequest('POST', '/api/v1/storage/share-batch', {
          paths: ['mira/notes.txt'],
        }) as Parameters<typeof batch.POST>[0]
      )
    ).status
  ).toBe(200);
  expect(
    (
      await read.GET(
        new Request(
          'http://localhost/api/v1/storage/download/file'
        ) as Parameters<typeof read.GET>[0],
        { params: Promise.resolve({ path: ['mira', 'notes.txt'] }) }
      )
    ).status
  ).toBe(200);
  expect(
    (
      await del.DELETE(
        createJsonRequest('DELETE', '/api/v1/storage/delete', {
          paths: ['mira/notes.txt'],
        }) as Parameters<typeof del.DELETE>[0]
      )
    ).status
  ).toBe(200);
  expect(download).toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith([`${ROOT_WORKSPACE_ID}/mira/notes.txt`]);
});

it.each(['mira/images', 'mira/%69mages'])(
  'denies signed uploads into %s',
  async (path) => {
    vi.clearAllMocks();
    const { POST } = await import('./upload-url/route');
    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/upload-url', {
        path,
        filename: 'file.txt',
      }) as Parameters<typeof POST>[0]
    );
    expect(response.status).toBe(403);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  }
);
