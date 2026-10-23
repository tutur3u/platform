import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  requireWhiteboardAccess: vi.fn(),
}));

vi.mock('../../access', () => ({
  requireWhiteboardAccess: (...args: unknown[]) =>
    mocks.requireWhiteboardAccess(...args),
}));

import { GET } from './route';

const wsId = '11111111-1111-4111-8111-111111111111';
const otherWsId = '22222222-2222-4222-8222-222222222222';
const boardId = '33333333-3333-4333-8333-333333333333';

function request(path: string) {
  const url = new URL('https://web.test/image-url');
  url.searchParams.set('path', path);
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.test/signed' },
    error: null,
  });
  mocks.requireWhiteboardAccess.mockResolvedValue({
    sbAdmin: {
      storage: {
        from: vi.fn((bucket: string) => {
          expect(bucket).toBe('workspaces');
          return { createSignedUrl: mocks.createSignedUrl };
        }),
      },
    },
    wsId,
  });
});

describe('whiteboard image signed URL path boundary', () => {
  it.each([
    `${wsId}/whiteboards/${boardId}/../${otherWsId}/secret.png`,
    `${wsId}/whiteboards/${boardId}/%2e%2e/${otherWsId}/secret.png`,
    `${wsId}/whiteboards/${boardId}/%2E%2E/${otherWsId}/secret.png`,
    `${wsId}/whiteboards/${boardId}/%2e./${otherWsId}/secret.png`,
    `${wsId}/whiteboards/${boardId}/.%2e/${otherWsId}/secret.png`,
    `${wsId}/whiteboards/${boardId}/%2f${otherWsId}/secret.png`,
    `${wsId}\\whiteboards\\${boardId}\\secret.png`,
    `${otherWsId}/whiteboards/${boardId}/secret.png`,
    `avatars/${wsId}/whiteboards/${boardId}/secret.png`,
    `https://storage.test/${wsId}/whiteboards/${boardId}/secret.png`,
  ])(
    'rejects unsafe, cross-workspace, or cross-bucket path %s',
    async (path) => {
      const response = await GET(request(path), {
        params: Promise.resolve({ wsId, boardId }),
      });

      expect(response?.status).toBe(400);
      expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    }
  );

  it('signs a valid image from the authorized workspace and bucket', async () => {
    const path = `${wsId}/whiteboards/${boardId}/image.png`;
    const response = await GET(request(path), {
      params: Promise.resolve({ wsId, boardId }),
    });

    expect(response?.status).toBe(200);
    expect(mocks.createSignedUrl).toHaveBeenCalledExactlyOnceWith(path, 3600);
  });
});
