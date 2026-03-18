import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createSignedUploadUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const requireWhiteboardAccess = vi.fn();

  const sbAdmin = {
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl,
        createSignedUrl,
      })),
    },
  };

  return {
    createSignedUploadUrl,
    createSignedUrl,
    requireWhiteboardAccess,
    sbAdmin,
  };
});

vi.mock('@/app/api/v1/workspaces/[wsId]/whiteboards/access', () => ({
  requireWhiteboardAccess: (
    ...args: Parameters<typeof mocks.requireWhiteboardAccess>
  ) => mocks.requireWhiteboardAccess(...args),
}));

describe('whiteboard image route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWhiteboardAccess.mockResolvedValue({
      sbAdmin: mocks.sbAdmin,
      user: { id: 'user-1' },
      wsId: 'ws-1',
    });
  });

  it('creates signed upload URLs for whiteboard images via admin storage', async () => {
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example/upload',
        token: 'token-1',
      },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/image-url/route'
    );
    if (!POST) {
      throw new Error('POST handler is not defined');
    }
    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/whiteboards/board/image-url',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filename: 'diagram.png' }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '11111111-1111-4111-8111-111111111111',
        }),
      }
    );
    if (!response) {
      throw new Error('POST handler did not return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      signedUrl: 'https://storage.example/upload',
      token: 'token-1',
      path: expect.stringMatching(
        /^ws-1\/whiteboards\/11111111-1111-4111-8111-111111111111\//
      ),
    });
    expect(mocks.sbAdmin.storage.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.createSignedUploadUrl).toHaveBeenCalled();
  });

  it('creates signed read URLs only for files inside the whiteboard folder', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example/read',
      },
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/image-url/route'
    );
    if (!GET) {
      throw new Error('GET handler is not defined');
    }
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/whiteboards/11111111-1111-4111-8111-111111111111/image-url?path=ws-1%2Fwhiteboards%2F11111111-1111-4111-8111-111111111111%2Fimage.png'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '11111111-1111-4111-8111-111111111111',
        }),
      }
    );
    if (!response) {
      throw new Error('GET handler did not return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      signedUrl: 'https://storage.example/read',
    });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/image.png',
      3600
    );
  });
});
