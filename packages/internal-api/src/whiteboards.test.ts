import { describe, expect, it, vi } from 'vitest';
import {
  createWhiteboardImageUploadUrl,
  createWorkspaceWhiteboard,
  deleteWorkspaceWhiteboard,
  getWhiteboardImageSignedUrl,
  getWorkspaceWhiteboard,
  listWorkspaceWhiteboards,
  updateWorkspaceWhiteboard,
} from './whiteboards';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(
  response: Response | ((url: URL, init?: RequestInit) => Response)
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      typeof response === 'function'
        ? response(new URL(String(input)), init)
        : response
  );
  return {
    fetchMock,
    options: { baseUrl: 'https://app.test', fetch: fetchMock as typeof fetch },
  };
}

describe('workspace whiteboards client', () => {
  it('lists boards through the workspace endpoint and unwraps them', async () => {
    const { fetchMock, options } = setup(json({ whiteboards: [{ id: 'b1' }] }));

    await expect(listWorkspaceWhiteboards('ws/1', options)).resolves.toEqual([
      { id: 'b1' },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(
      '/api/v1/workspaces/ws%2F1/whiteboards'
    );
    expect(init?.cache).toBe('no-store');
  });

  it('reads one board and encodes both path segments', async () => {
    const { fetchMock, options } = setup(
      json({ whiteboard: { id: 'b 1', snapshot: null } })
    );

    await expect(
      getWorkspaceWhiteboard('ws-1', 'b 1', options)
    ).resolves.toMatchObject({ id: 'b 1' });
    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(
      '/api/v1/workspaces/ws-1/whiteboards/b%201'
    );
  });

  it('creates, patches and deletes with the matching method and JSON body', async () => {
    const { fetchMock, options } = setup((_url, init) =>
      init?.method === 'DELETE'
        ? json({ success: true })
        : json(
            { whiteboard: { id: 'b1' } },
            init?.method === 'POST' ? 201 : 200
          )
    );

    await createWorkspaceWhiteboard('ws-1', { title: 'Roadmap' }, options);
    await updateWorkspaceWhiteboard(
      'ws-1',
      'b1',
      { archived_at: null },
      options
    );
    await deleteWorkspaceWhiteboard('ws-1', 'b1', options);

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      method: init?.method,
      body: init?.body,
    }));
    expect(calls).toEqual([
      {
        path: '/api/v1/workspaces/ws-1/whiteboards',
        method: 'POST',
        body: JSON.stringify({ title: 'Roadmap' }),
      },
      {
        path: '/api/v1/workspaces/ws-1/whiteboards/b1',
        method: 'PATCH',
        body: JSON.stringify({ archived_at: null }),
      },
      {
        path: '/api/v1/workspaces/ws-1/whiteboards/b1',
        method: 'DELETE',
        body: undefined,
      },
    ]);
  });

  it('surfaces the API error message when a write is refused', async () => {
    const { options } = setup(json({ error: 'Workspace access denied' }, 403));

    await expect(
      createWorkspaceWhiteboard('ws-1', { title: 'x' }, options)
    ).rejects.toMatchObject({
      message: 'Workspace access denied',
      status: 403,
    });
  });

  it('requests an upload url and resolves signed read urls, treating a miss as null', async () => {
    const { fetchMock, options } = setup((url, init) =>
      url.pathname.endsWith('/image-url') && init?.method === 'POST'
        ? json({ signedUrl: 'https://up', token: 't', path: 'ws/b/a.png' })
        : url.searchParams.get('path') === 'ws/b/a.png'
          ? json({ signedUrl: 'https://read' })
          : json({ error: 'gone' }, 404)
    );

    await expect(
      createWhiteboardImageUploadUrl('ws-1', 'b1', 'a.png', options)
    ).resolves.toMatchObject({ path: 'ws/b/a.png' });
    await expect(
      getWhiteboardImageSignedUrl('ws-1', 'b1', 'ws/b/a.png', options)
    ).resolves.toBe('https://read');
    await expect(
      getWhiteboardImageSignedUrl('ws-1', 'b1', 'missing', options)
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
