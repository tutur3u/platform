import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  publish: vi.fn(),
  ready: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('./realtime-worker', () => ({
  isChatRealtimeWorkerReady: mocks.ready,
  publishChatRealtimeWorkerEvent: mocks.publish,
}));

import {
  publishLatestChatRevocation,
  retryChatRealtimeRevocations,
} from './realtime-revocations';

const actor = 'a6742000-0000-4000-8000-000000000001';
const workspace = 'a6742000-0000-4000-8000-000000000011';
const alias = 'a6742000-0000-4000-8000-000000000012';
const conversation = 'a6742000-0000-4000-8000-000000000021';
const auditId = 'a6742000-0000-4000-8000-000000000031';
const createdAt = '2026-11-20T05:28:00.000Z';
const now = Date.parse('2026-11-20T05:35:02.000Z');
const audience = { scope: 'users' as const, userIds: [actor] };

const rows = [
  {
    actor_id: actor,
    chat_conversations: { ws_id: workspace },
    conversation_id: conversation,
    created_at: createdAt,
    id: auditId,
    metadata: { mode: 'left', type: 'group' },
  },
];

const signal = new AbortController().signal;

function stubAuditRows(data: unknown[]) {
  const query = {
    abortSignal: vi.fn().mockResolvedValue({ data, error: null }),
    eq: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    schema: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  mocks.admin.mockResolvedValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ready.mockResolvedValue(true);
  mocks.publish.mockResolvedValue([]);
});

it('recovers a failed immediate removal with the same committed audit event', async () => {
  const query = stubAuditRows(rows);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mocks.publish.mockRejectedValueOnce(
      new Error('Worker health returned 503')
    );
    await publishLatestChatRevocation({
      actorUserId: actor,
      audience,
      conversationId: conversation,
      wsId: alias,
    });
    expect(query.eq).toHaveBeenCalledWith('ws_id', alias);

    await expect(retryChatRealtimeRevocations(now, signal)).resolves.toEqual({
      capped: false,
      delivered: 1,
      failed: 0,
      skipped: false,
    });
    expect(query.gte).toHaveBeenCalledWith(
      'created_at',
      '2026-11-20T05:25:00.000Z'
    );
    expect(query.lt).toHaveBeenCalledWith(
      'created_at',
      '2026-11-20T05:35:00.000Z'
    );
    const event = {
      actorUserId: actor,
      audience,
      conversationId: conversation,
      id: auditId,
      sentAt: createdAt,
      type: 'member.removed',
      userId: actor,
      wsId: workspace,
    };
    expect(mocks.publish).toHaveBeenNthCalledWith(1, event);
    expect(mocks.publish).toHaveBeenNthCalledWith(2, event, signal);
  } finally {
    log.mockRestore();
  }
});

it('reads and publishes nothing when the Worker is stopped', async () => {
  mocks.ready.mockResolvedValue(false);

  await expect(retryChatRealtimeRevocations(now, signal)).resolves.toEqual({
    capped: false,
    delivered: 0,
    failed: 0,
    skipped: true,
  });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('limits scheduled recovery and reports partial failures', async () => {
  const query = stubAuditRows(Array.from({ length: 33 }, () => rows[0]));
  mocks.publish.mockRejectedValueOnce(new Error('Worker unavailable'));

  await expect(retryChatRealtimeRevocations(now, signal)).resolves.toEqual({
    capped: true,
    delivered: 31,
    failed: 1,
    skipped: false,
  });
  expect(query.limit).toHaveBeenCalledWith(33);
  expect(mocks.publish).toHaveBeenCalledTimes(32);
});
