import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  importExternalChatEvent: vi.fn(),
  publishChatRealtimeEvent: vi.fn(),
  readExternalChatBinding: vi.fn(),
  upsert: vi.fn(),
  verifyExternalChatSecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    schema: () => ({
      from: () => ({ upsert: mocks.upsert }),
    }),
  })),
}));

vi.mock('@/lib/external-chat/crypto', () => ({
  verifyExternalChatSecret: (...args: unknown[]) =>
    mocks.verifyExternalChatSecret(...args),
}));

vi.mock('@/lib/external-chat/store', () => ({
  importExternalChatEvent: (...args: unknown[]) =>
    mocks.importExternalChatEvent(...args),
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));

const wsId = 'd14c91ba-75b1-4f5d-ad0f-f837840e1e8f';
const validEvent = {
  agentId: 'agent-1',
  content: 'hello',
  contentType: 1,
  context: { route: '/migration-test' },
  direction: 'visitor',
  messageId: 'message-1',
  status: 'sent',
  timestamp: new Date().toISOString(),
  visitorId: 'visitor-1',
  visitorProfile: { displayName: 'Visitor' },
};

function eventRequest(secret: string, event: unknown = validEvent) {
  return new Request('http://localhost/external-chat/events', {
    body: JSON.stringify(event),
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      'x-external-binding-id': wsId,
    },
    method: 'POST',
  });
}

describe('external chat ingest route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: { chat: { enabled: true } },
      },
      credentials: {
        configuration_revision: 7,
        ingest_secret_hash: 'active-hash',
        pending_action: 'set_ingest',
        pending_secret_hash: 'pending-hash',
        verified_at: '2026-08-01T17:00:00.000Z',
      },
    });
    mocks.importExternalChatEvent.mockResolvedValue({
      conversation: { id: 'conversation-1' },
      conversationCreated: true,
      conversationId: 'conversation-1',
      duplicate: false,
      message: {
        conversationId: 'conversation-1',
        id: 'native-message-1',
      },
      messageId: 'native-message-1',
      threadId: 'thread-1',
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.verifyExternalChatSecret.mockImplementation(
      (secret: string, hash: string) =>
        (secret === 'old-secret' && hash === 'active-hash') ||
        (secret === 'new-secret' && hash === 'pending-hash')
    );
  });

  it('accepts the staged ingest hash during credential rotation', async () => {
    const { POST } = await import('./route');
    const response = await POST(eventRequest('new-secret'));

    expect(response.status).toBe(201);
    expect(mocks.importExternalChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        configurationRevision: 7,
        connectorKey: 'opaque-connector',
        wsId,
      })
    );
  });

  it('continues accepting the active ingest hash during rotation', async () => {
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(201);
  });

  it('publishes new inbound conversations and messages to the live inbox', async () => {
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(201);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actorUserId: null,
        conversationId: 'conversation-1',
        type: 'conversation.created',
        wsId,
      })
    );
    expect(mocks.publishChatRealtimeEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorUserId: null,
        conversationId: 'conversation-1',
        type: 'message.created',
        wsId,
      })
    );
    expect(await response.json()).toEqual({
      conversationId: 'conversation-1',
      duplicate: false,
      messageId: 'native-message-1',
      threadId: 'thread-1',
    });
  });

  it('does not republish duplicate inbound events', async () => {
    mocks.importExternalChatEvent.mockResolvedValueOnce({
      duplicate: true,
      messageId: 'native-message-1',
    });
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(200);
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
  });

  it('rejects an event timestamp beyond the allowed clock skew', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      eventRequest('old-secret', {
        ...validEvent,
        timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.importExternalChatEvent).not.toHaveBeenCalled();
  });
});
