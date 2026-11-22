import {
  expectAssetsContract,
  expectPersistenceContract,
} from '@tuturuuu/whiteboard/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  uploadToStorageUrl: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('@/lib/api-fetch', () => ({
  uploadToStorageUrl: mocks.uploadToStorageUrl,
}));
vi.mock('./image-upload', () => ({
  optimizeWhiteboardImageUpload: async (file: File) => file,
}));

const {
  createWorkspaceWhiteboardAssets,
  createWorkspaceWhiteboardPersistence,
} = await import('./workspace-adapters');

const board = { wsId: 'ws-1', boardId: 'board-1' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** A fake of the whiteboards API: one stored row plus the image-url endpoints. */
function createApi() {
  let row: { snapshot: unknown; updated_at: string | null } = {
    snapshot: null,
    updated_at: null,
  };
  const files = new Map<string, string>();
  const calls: { url: string; init?: RequestInit }[] = [];

  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const method = init?.method ?? 'GET';

      if (
        url.startsWith('/api/v1/workspaces/ws-1/whiteboards/board-1/image-url')
      ) {
        if (method === 'POST') {
          const { filename } = JSON.parse(String(init?.body));
          const path = `ws-1/board-1/${filename}`;
          files.set(path, `https://signed.test/${path}`);
          return json({ signedUrl: 'https://upload.test', token: 't', path });
        }
        const path = new URL(url, 'http://x').searchParams.get('path') ?? '';
        const signedUrl = files.get(path);
        return signedUrl ? json({ signedUrl }) : json({ error: 'nope' }, 404);
      }

      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        row = { snapshot: body.snapshot, updated_at: body.updated_at };
        return json({});
      }

      return json({ whiteboard: row });
    }
  ) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

describe('workspace whiteboard adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('persistence satisfies the WhiteboardPersistence contract', async () => {
    const { fetchImpl } = createApi();
    let tick = 0;
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(
      () => `2026-01-01T00:00:0${++tick}.000Z`
    );

    await expectPersistenceContract(
      createWorkspaceWhiteboardPersistence(board, fetchImpl)
    );
  });

  it('assets satisfy the WhiteboardAssets contract', async () => {
    const { fetchImpl } = createApi();

    await expectAssetsContract(
      createWorkspaceWhiteboardAssets(board, fetchImpl)
    );
    expect(mocks.uploadToStorageUrl).toHaveBeenCalledWith(
      'https://upload.test',
      expect.any(File),
      't'
    );
  });

  it('saves with PATCH and the revision it sends is the stored updated_at', async () => {
    const { fetchImpl, calls } = createApi();
    const persistence = createWorkspaceWhiteboardPersistence(board, fetchImpl);

    const { revision } = await persistence.save({ elements: [] });
    const patch = calls.find((c) => c.init?.method === 'PATCH');

    expect(patch?.url).toBe('/api/v1/workspaces/ws-1/whiteboards/board-1');
    expect(JSON.parse(String(patch?.init?.body)).updated_at).toBe(revision);
    expect((await persistence.load()).revision).toBe(revision);
  });

  it('throws the API error message when a load or save fails', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: 'forbidden' }, 403)
    ) as unknown as typeof fetch;
    const persistence = createWorkspaceWhiteboardPersistence(board, fetchImpl);

    await expect(persistence.load()).rejects.toThrow('forbidden');
    await expect(persistence.save({ elements: [] })).rejects.toThrow(
      'forbidden'
    );
  });

  it('reports a failed upload-url request to the user and rethrows', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: 'too big' }, 413)
    ) as unknown as typeof fetch;
    const assets = createWorkspaceWhiteboardAssets(board, fetchImpl);

    await expect(assets.upload(new File(['x'], 'a.png'))).rejects.toThrow(
      'too big'
    );
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to upload image');
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to process image');
  });
});
