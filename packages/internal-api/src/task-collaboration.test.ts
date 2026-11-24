import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceTaskComment,
  createWorkspaceTaskLink,
  deleteWorkspaceTaskComment,
  deleteWorkspaceTaskLink,
  getWorkspaceTaskExternalRef,
  getWorkspaceTaskTimeline,
  importWorkspaceTasksFromGithub,
  listWorkspaceTaskComments,
  listWorkspaceTaskLinks,
  updateWorkspaceTaskComment,
} from './task-collaboration';

function setup(payload: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
  return {
    fetchMock,
    options: {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    },
  };
}

const BASE =
  'https://internal.example.com/api/v1/workspaces/ws%2F1/tasks/task%2F1';

describe('task collaboration internal-api helpers', () => {
  it('lists comments with an encoded path and paging', async () => {
    const { fetchMock, options } = setup({ comments: [], nextCursor: null });
    await listWorkspaceTaskComments(
      'ws/1',
      'task/1',
      { cursor: 'a b', limit: 20 },
      options
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/comments?cursor=a+b&limit=20`,
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('adds, edits and removes a comment', async () => {
    const { fetchMock, options } = setup({});
    await createWorkspaceTaskComment('ws/1', 'task/1', { body: 'hi' }, options);
    await updateWorkspaceTaskComment(
      'ws/1',
      'task/1',
      'c/1',
      { body: 'edit' },
      options
    );
    await deleteWorkspaceTaskComment('ws/1', 'task/1', 'c/1', options);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${BASE}/comments`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${BASE}/comments/c%2F1`,
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${BASE}/comments/c%2F1`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('lists, adds and removes links', async () => {
    const { fetchMock, options } = setup({});
    await listWorkspaceTaskLinks('ws/1', 'task/1', options);
    await createWorkspaceTaskLink(
      'ws/1',
      'task/1',
      { url: 'https://github.com/o/r/pull/1' },
      options
    );
    await deleteWorkspaceTaskLink('ws/1', 'task/1', 'l/1', options);
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? 'GET'])
    ).toEqual([
      [`${BASE}/links`, 'GET'],
      [`${BASE}/links`, 'POST'],
      [`${BASE}/links/l%2F1`, 'DELETE'],
    ]);
  });

  it('reads the external ref and the timeline', async () => {
    const { fetchMock, options } = setup({});
    await getWorkspaceTaskExternalRef('ws/1', 'task/1', options);
    await getWorkspaceTaskTimeline('ws/1', 'task/1', undefined, options);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/external-ref`,
      `${BASE}/timeline`,
    ]);
  });

  it('posts import batches to the workspace import route', async () => {
    const { fetchMock, options } = setup({ results: [] });
    await importWorkspaceTasksFromGithub(
      'ws/1',
      {
        board_id: 'b',
        dry_run: true,
        mapping: { status_lists: {} },
        issues: [],
      },
      options
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%2F1/tasks/import/github',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
