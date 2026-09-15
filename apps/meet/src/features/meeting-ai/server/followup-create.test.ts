import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({
  access: vi.fn(),
  tools: vi.fn(),
  execute: vi.fn(),
  room: vi.fn(),
  receipt: vi.fn(),
  prepareEvent: vi.fn(),
  prepareTask: vi.fn(),
}));
vi.mock('./followup-event', () => ({
  prepareCalendarFollowup: mock.prepareEvent,
}));
vi.mock('./followup-context', () => ({ followupAccess: mock.access }));
vi.mock('@tuturuuu/ai/meetings/workspace-tools', () => ({
  createMeetWorkspaceTools: mock.tools,
}));
vi.mock('./followup-task', () => ({ prepareTaskFollowup: mock.prepareTask }));
vi.mock('@/features/call/lib/call-access', () => ({
  getMeetCallAccess: mock.room,
}));
vi.mock('@/features/call/server/room-service', () => ({
  callRoomService: mock.receipt,
}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { createFollowup } from './followup-create';

const userId = '11111111-1111-4111-8111-111111111111';
const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const boardId = '44444444-4444-4444-8444-444444444444';
const listId = '55555555-5555-4555-8555-555555555555';
const input = {
  requestId: '66666666-6666-4666-8666-666666666666',
  startedAt: Date.now(),
  kind: 'task',
  title: 'Review',
  description: 'From notes',
  workspaceId: wsId,
  userId,
  boardId,
  listId,
  timezone: 'Asia/Ho_Chi_Minh',
  start: '',
  end: '',
  due: '2026-09-15T09:00',
  assignToMe: true,
};
const params = { params: Promise.resolve({ wsId, meetingId }) };
const request = (body: unknown = input, origin = 'https://meet.tuturuuu.com') =>
  new Request(
    `https://meet.tuturuuu.com/api/meet-ai/${wsId}/${meetingId}/followups`,
    {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
beforeEach(() => {
  vi.clearAllMocks();
  mock.access.mockResolvedValue({
    db: {},
    user: { id: userId },
    workspaceId: wsId,
    meetingId,
    permissions: { withoutPermission: () => false },
  });
  mock.tools.mockReturnValue({ create_task: {}, create_event: {} });
  mock.room.mockResolvedValue({ user: { id: userId } });
  mock.receipt.mockResolvedValue({ started: true });
  mock.prepareTask.mockResolvedValue(mock.execute);
  mock.execute.mockResolvedValue({ success: true, task: { id: listId } });
  mock.prepareEvent.mockResolvedValue(async () => ({
    success: true,
    event: { id: listId },
  }));
});
it('uses the verified actor and reviewed destination, then stores a private receipt', async () => {
  const result = await createFollowup(request(), params);
  expect(mock.prepareTask).toHaveBeenCalledWith(
    expect.objectContaining({ user: { id: userId }, workspaceId: wsId }),
    boardId,
    expect.objectContaining({
      listId,
      assignee_ids: [userId],
      end_date: '2026-09-15T02:00:00.000Z',
    })
  );
  expect(result.url).toContain(`tasks.tuturuuu.com/${wsId}/tasks/`);
  expect(mock.receipt).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'personal.finish' })
  );
});
it('rejects cross-origin requests and changed identities before writes', async () => {
  await expect(
    createFollowup(request(input, 'https://other.test'), params)
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createFollowup(request({ ...input, userId: meetingId }), params)
  ).rejects.toMatchObject({ status: 409 });
  expect(mock.execute).not.toHaveBeenCalled();
});
it('requires destination permissions and explicit self assignment', async () => {
  mock.tools.mockReturnValue({});
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    createFollowup(request({ ...input, assignToMe: false }), params)
  ).rejects.toMatchObject({ status: 400 });
  expect(mock.execute).not.toHaveBeenCalled();
});
it('replays a completed receipt without creating a duplicate', async () => {
  const saved = { url: `https://tasks.tuturuuu.com/${wsId}` };
  mock.receipt.mockResolvedValue({ text: JSON.stringify(saved) });
  expect(await createFollowup(request(), params)).toEqual(saved);
  expect(mock.execute).not.toHaveBeenCalled();
});
it('never writes after a pending receipt or claims success after partial creation', async () => {
  mock.receipt.mockResolvedValue({});
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    status: 409,
  });
  expect(mock.execute).not.toHaveBeenCalled();
  mock.receipt.mockResolvedValue({ started: true });
  mock.execute.mockResolvedValue({
    created: true,
    taskId: listId,
    error: 'Assignment failed',
  });
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    status: 502,
  });
  expect(mock.receipt).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'personal.finish' })
  );
});
it('rejects invalid event intervals before consuming a receipt', async () => {
  await expect(
    createFollowup(
      request({
        ...input,
        kind: 'event',
        start: '2026-09-15T10:00',
        end: '2026-09-15T09:00',
      }),
      params
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(mock.receipt).not.toHaveBeenCalled();
});

it('rejects an account change during the second room identity lookup before claiming a receipt', async () => {
  mock.room.mockResolvedValue({ user: { id: boardId } });
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    status: 409,
    code: 'FOLLOWUP_NOT_SAVED',
  });
  expect(mock.receipt).not.toHaveBeenCalled();
  expect(mock.execute).not.toHaveBeenCalled();
});
it('fingerprints normalized writes independently of retry metadata', async () => {
  await createFollowup(request(), params);
  const first = mock.receipt.mock.calls[0]?.[1].fingerprint;
  mock.receipt.mockClear();
  await createFollowup(
    request({
      ...input,
      startedAt: input.startedAt + 100,
      title: '  Review  ',
    }),
    params
  );
  expect(mock.receipt.mock.calls[0]?.[1].fingerprint).toBe(first);
});
it('marks confirmed pre-write failures retryable but keeps uncertain writes blocked', async () => {
  mock.execute.mockResolvedValueOnce({
    created: false,
    error: 'List unavailable',
  });
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    code: 'FOLLOWUP_NOT_SAVED',
  });
  expect(mock.receipt).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'personal.release', id: input.requestId })
  );
  mock.receipt.mockClear();
  mock.execute.mockResolvedValueOnce({ error: 'Connection lost' });
  await expect(createFollowup(request(), params)).rejects.toMatchObject({
    code: undefined,
  });
});

it('prepares the reviewed UTC event for the primary calendar and saves it only after the receipt is claimed', async () => {
  const save = vi.fn(async () => ({ success: true, event: { id: listId } }));
  mock.prepareEvent.mockResolvedValue(save);
  const result = await createFollowup(
    request({
      ...input,
      kind: 'event',
      start: '2026-09-15T09:00',
      end: '2026-09-15T10:00',
    }),
    params
  );
  expect(mock.prepareEvent).toHaveBeenCalledWith(
    expect.anything(),
    wsId,
    expect.objectContaining({
      start_at: '2026-09-15T02:00:00.000Z',
      end_at: '2026-09-15T03:00:00.000Z',
    })
  );
  expect(save).toHaveBeenCalledOnce();
  expect(mock.receipt.mock.invocationCallOrder[0]).toBeLessThan(
    save.mock.invocationCallOrder[0]!
  );
  expect(mock.execute).not.toHaveBeenCalled();
  expect(result.url).toBe(`https://calendar.tuturuuu.com/${wsId}`);
});
