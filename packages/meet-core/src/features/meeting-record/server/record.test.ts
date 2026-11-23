import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ access: vi.fn(), projects: vi.fn() }));
vi.mock('./access', () => ({
  meetingRecordAccess: mocks.access,
  MeetingRecordError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./project-links', () => ({ listLinkedProjects: mocks.projects }));

import {
  addMeetingRecordItem,
  listMeetingTasks,
  readMeetingRecord,
  updateMeetingRecordItem,
} from './record';

const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const params = { params: Promise.resolve({ wsId, meetingId }) };

function query(result: unknown, single: unknown = result) {
  const q: Record<string, unknown> = {};
  for (const name of [
    'select',
    'eq',
    'in',
    'is',
    'order',
    'limit',
    'insert',
    'update',
    'delete',
  ])
    q[name] = vi.fn(() => q);
  q.single = vi.fn(async () => single);
  q.maybeSingle = vi.fn(async () => single);
  q.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return q;
}

function setup(
  tables: Record<string, unknown>,
  rights = { canEditRecord: true, isHost: true }
) {
  const from = vi.fn((table: string) => tables[table]);
  const db = { from, schema: vi.fn(() => ({ from })) };
  mocks.access.mockResolvedValue({
    db,
    wsId,
    meeting: { id: meetingId },
    user: { id: 'host' },
    ...rights,
  });
  return db;
}

const post = (body: unknown, method = 'POST') =>
  new Request('https://meet.tuturuuu.com/api/meet-record/x/y', {
    method,
    headers: { origin: 'https://meet.tuturuuu.com' },
    body: JSON.stringify(body),
  });

const taskRow = (id: string, ws: string) => ({
  id,
  name: id,
  completed_at: null,
  closed_at: null,
  deleted_at: null,
  end_date: null,
  task_lists: {
    status: 'active',
    board_id: 'board',
    workspace_boards: { id: 'board', name: 'Board', ws_id: ws },
  },
  assignees: [{ user: { id: 'u1', display_name: 'An' } }],
});

describe('meeting record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects.mockResolvedValue([]);
  });

  it('reports host and edit rights with the items', async () => {
    setup(
      {
        meeting_record_items: query({
          data: [
            {
              id: itemId,
              kind: 'decision',
              content: 'Ship it',
              position: 0,
              completed_at: null,
            },
          ],
          error: null,
        }),
        meeting_task_links: query({ data: [], error: null }),
      },
      { canEditRecord: true, isHost: false }
    );
    await expect(
      readMeetingRecord(new Request('https://x'), params)
    ).resolves.toEqual({
      canEdit: true,
      isHost: false,
      items: [
        {
          id: itemId,
          kind: 'decision',
          content: 'Ship it',
          position: 0,
          completedAt: null,
        },
      ],
      tasks: [],
      defaultBoardId: null,
    });
  });

  it('keeps only tasks still on a board in the meeting workspace, oldest first', async () => {
    const db = setup({
      meeting_task_links: query({
        data: [
          {
            meeting_id: meetingId,
            task_id: 't2',
            link_kind: 'source',
            carried_from_meeting_id: null,
          },
          {
            meeting_id: meetingId,
            task_id: 't1',
            link_kind: 'source',
            carried_from_meeting_id: null,
          },
          {
            meeting_id: meetingId,
            task_id: 'moved',
            link_kind: 'source',
            carried_from_meeting_id: null,
          },
        ],
        error: null,
      }),
      tasks: query({
        data: [
          taskRow('t1', wsId),
          taskRow('t2', wsId),
          taskRow('moved', 'other'),
        ],
        error: null,
      }),
    });
    const tasks = await listMeetingTasks(db as never, wsId, [meetingId]);
    expect(tasks.map((entry) => entry.task.id)).toEqual(['t1', 't2']);
    expect(tasks[0]?.task.assignees).toEqual([{ id: 'u1', displayName: 'An' }]);
  });

  it('refuses edits from members who are neither host nor admin', async () => {
    setup({}, { canEditRecord: false, isHost: false });
    await expect(
      addMeetingRecordItem(post({ kind: 'agenda', content: 'Intro' }), params)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('reports a meeting deleted since the access check as not found', async () => {
    setup({
      meeting_record_items: query(
        { count: 0, error: null },
        { data: null, error: { code: '23503' } }
      ),
    });
    await expect(
      addMeetingRecordItem(post({ kind: 'agenda', content: 'Intro' }), params)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('caps a meeting record', async () => {
    setup({ meeting_record_items: query({ count: 200, error: null }) });
    await expect(
      addMeetingRecordItem(post({ kind: 'decision', content: 'More' }), params)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('updates only an item on this meeting', async () => {
    const items = query({ data: [], error: null });
    setup({ meeting_record_items: items });
    await expect(
      updateMeetingRecordItem(
        post({ id: itemId, completed: true }, 'PATCH'),
        params
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(items.eq).toHaveBeenCalledWith('meeting_id', meetingId);
    expect(items.eq).toHaveBeenCalledWith('ws_id', wsId);
  });
});
