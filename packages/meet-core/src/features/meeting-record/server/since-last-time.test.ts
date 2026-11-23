import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  projects: vi.fn(),
  tasks: vi.fn(),
}));
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
vi.mock('./record', () => ({ listMeetingTasks: mocks.tasks }));

import { carryOverItems, readSinceLastTime } from './since-last-time';

const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const earlierId = '44444444-4444-4444-8444-444444444444';
const olderId = '55555555-5555-4555-8555-555555555555';
const openId = '66666666-6666-4666-8666-666666666666';
const doneId = '77777777-7777-4777-8777-777777777777';
const hereId = '88888888-8888-4888-8888-888888888888';
const params = { params: Promise.resolve({ wsId, meetingId }) };

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'in', 'neq', 'lt', 'order', 'limit'])
    q[name] = vi.fn(() => q);
  q.upsert = vi.fn(async () => ({ error: null }));
  q.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return q;
}

const task = (id: string, done: boolean, doneAt: string | null = null) => ({
  id,
  name: id,
  done,
  doneAt,
  dueAt: null,
  boardId: null,
  boardName: null,
  assignees: [],
  linkKind: 'source',
  carriedFromMeetingId: null,
});

function setup(canEditRecord: boolean) {
  const links = query({
    data: [{ entity_id: earlierId }, { entity_id: olderId }],
    error: null,
  });
  const meetings = query({
    data: [
      { id: earlierId, name: 'Week 2', time: '2026-11-20T00:00:00Z' },
      { id: olderId, name: 'Week 1', time: '2026-11-13T00:00:00Z' },
    ],
    error: null,
  });
  const from = vi.fn((table: string) =>
    table === 'task_project_links' || table === 'meeting_task_links'
      ? links
      : meetings
  );
  mocks.access.mockResolvedValue({
    db: { from, schema: vi.fn(() => ({ from })) },
    wsId,
    meeting: { id: meetingId, time: '2026-11-27T00:00:00Z' },
    user: { id: 'host' },
    canEditRecord,
  });
  mocks.projects.mockResolvedValue([{ id: 'project' }]);
  mocks.tasks.mockImplementation(async (_db, _ws, ids: string[]) =>
    ids.includes(meetingId)
      ? [{ meetingId, task: task(hereId, false) }]
      : [
          { meetingId: olderId, task: task(openId, false) },
          { meetingId: earlierId, task: task(openId, false) },
          {
            meetingId: earlierId,
            task: task(doneId, true, '2026-11-22T00:00:00Z'),
          },
          { meetingId: olderId, task: task(hereId, false) },
        ]
  );
  return links;
}

const post = (taskIds: string[]) =>
  new Request('https://meet.tuturuuu.com/api/meet-record/x/y/since', {
    method: 'POST',
    headers: { origin: 'https://meet.tuturuuu.com' },
    body: JSON.stringify({ taskIds }),
  });

describe('since last time', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists open and resolved items from earlier meetings in the project', async () => {
    setup(false);
    const result = await readSinceLastTime(new Request('https://x'), params);
    expect(result.previousMeeting?.id).toBe(earlierId);
    expect(result.open.map((t) => [t.id, t.fromMeetingId])).toEqual([
      [openId, earlierId],
    ]);
    expect(result.resolved.map((t) => t.id)).toEqual([doneId]);
    expect(result.canCarry).toBe(false);
  });

  it('carries only items still open on an earlier meeting', async () => {
    const links = setup(true);
    await expect(
      carryOverItems(post([openId, doneId, hereId]), params)
    ).resolves.toEqual({ carried: 1 });
    expect(links.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          meeting_id: meetingId,
          task_id: openId,
          link_kind: 'carried_over',
          carried_from_meeting_id: earlierId,
        }),
      ],
      { onConflict: 'meeting_id,task_id', ignoreDuplicates: true }
    );
  });

  it('leaves carry-over to the host', async () => {
    setup(false);
    await expect(carryOverItems(post([openId]), params)).rejects.toMatchObject({
      status: 403,
    });
  });
});
