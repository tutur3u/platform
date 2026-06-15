import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    const { GET } = await import('./list/route');

    const response = await GET(
      new Request(
        `http://localhost/api/v1/storage/list?path=${encodeURIComponent(RESERVED_PARENT_PATH)}`
      ) as Parameters<typeof GET>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
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
    const { GET } = await import('./download/[...path]/route');

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

  it('rejects signed share URLs for the mobile deployment vault prefix', async () => {
    const { POST } = await import('./share/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/share', {
        path: RESERVED_FILE_PATH,
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('rejects batch signed share URLs that include the mobile deployment vault prefix', async () => {
    const { POST } = await import('./share-batch/route');

    const response = await POST(
      createJsonRequest('POST', '/api/v1/storage/share-batch', {
        paths: ['public/readme.txt', RESERVED_FILE_PATH],
      }) as Parameters<typeof POST>[0]
    );

    await expectReserved(response);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });
});
