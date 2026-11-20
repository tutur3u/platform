import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('./realtime-worker', () => ({
  publishChatRealtimeWorkerEvent: mocks.publish,
}));

import { publishLatestChatRevocation } from './realtime-revocations';

const actor = 'a6742000-0000-4000-8000-000000000001';
const workspace = 'a6742000-0000-4000-8000-000000000011';
const alias = 'a6742000-0000-4000-8000-000000000012';
const conversation = 'a6742000-0000-4000-8000-000000000021';
const auditId = 'a6742000-0000-4000-8000-000000000031';
const createdAt = '2026-11-20T05:28:00.000Z';
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
  mocks.publish.mockResolvedValue([]);
});

it('publishes the immediate removal with the committed audit identity', async () => {
  const query = stubAuditRows(rows);
  await publishLatestChatRevocation({
    actorUserId: actor,
    audience,
    conversationId: conversation,
    wsId: alias,
  });

  expect(query.eq).toHaveBeenCalledWith('ws_id', alias);
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({
    actorUserId: actor,
    audience,
    conversationId: conversation,
    id: auditId,
    sentAt: createdAt,
    type: 'member.removed',
    userId: actor,
    wsId: workspace,
  });
});
