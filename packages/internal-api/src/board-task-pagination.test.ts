import { expect, it, vi } from 'vitest';
import { listWorkspaceTasks } from './tasks';

it('forwards the board continuation and abort signal', async () => {
  const { signal } = new AbortController();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ tasks: [], nextCursor: null }));
  await expect(
    listWorkspaceTasks(
      'ws-1',
      { boardId: 'board-1', cursor: 'start', signal },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    )
  ).resolves.toMatchObject({ nextCursor: null });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://internal.example.com/api/v1/workspaces/ws-1/tasks?boardId=board-1&cursor=start',
    expect.objectContaining({ signal })
  );
});
