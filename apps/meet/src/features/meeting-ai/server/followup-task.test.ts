import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const handler = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/tasks-api/server/tasks/route', () => ({
  handleTaskRoutePOST: handler,
}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { prepareTaskFollowup } from './followup-task';

const actorId = '11111111-1111-4111-8111-111111111111';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const payload = {
  name: 'Follow up',
  listId: 'list',
  description: 'First line\nSecond line',
  assignee_ids: [assigneeId],
  priority: 'high' as const,
  end_date: null,
};
function fixture(memberIds = [assigneeId], board: unknown = { id: 'board' }) {
  const query = (data: unknown) => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      in: vi.fn(),
      maybeSingle: async () => ({ data, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data, error: null })),
    };
    for (const key of ['select', 'eq', 'is', 'in'] as const)
      q[key].mockReturnValue(q);
    return q;
  };
  const tables = {
    workspace_boards: query(board),
    task_lists: query({ id: 'list' }),
    workspace_members: query(memberIds.map((user_id) => ({ user_id }))),
  };
  const access = {
    workspaceId: 'workspace',
    user: { id: actorId },
    db: { from: (name: keyof typeof tables) => tables[name] },
  };
  return { access, tables };
}
beforeEach(() => {
  handler
    .mockReset()
    .mockResolvedValue(
      new Response(JSON.stringify({ task: { id: 'created' } }), { status: 201 })
    );
});
it('passes the Meet actor and selected assignees to Tasks after preflight', async () => {
  const { access, tables } = fixture();
  const save = await prepareTaskFollowup(access as never, 'board', payload);
  expect(handler).not.toHaveBeenCalled();
  expect(tables.task_lists.eq).toHaveBeenCalledWith('board_id', 'board');
  expect(tables.workspace_boards.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  expect(await save()).toEqual({ task: { id: 'created' } });
  const [request, context, auth] = handler.mock.calls[0]!;
  const body = await request.json();
  expect(body).toMatchObject({
    assignee_ids: [assigneeId],
    priority: 'high',
    listId: 'list',
  });
  expect(JSON.parse(body.description).content).toHaveLength(2);
  expect(await context.params).toEqual({ wsId: 'workspace' });
  expect(auth).toEqual({
    appSession: true,
    user: access.user,
    supabase: access.db,
  });
});
it('rejects stale assignees or boards before a write', async () => {
  await expect(
    prepareTaskFollowup(fixture([]).access as never, 'board', payload)
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    prepareTaskFollowup(
      fixture([assigneeId], null).access as never,
      'board',
      payload
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(handler).not.toHaveBeenCalled();
});
it('keeps post-handler failures uncertain because a task may already exist', async () => {
  handler.mockResolvedValueOnce(new Response('{}', { status: 500 }));
  const save = await prepareTaskFollowup(
    fixture().access as never,
    'board',
    payload
  );
  const result = await save();
  expect(result).toHaveProperty('error');
  expect(result).not.toHaveProperty('created');
});
