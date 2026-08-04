import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  applyExternalChatMessageState: vi.fn(),
  claimExternalChatSourceEvent: vi.fn(),
  hydrateExternalChatReplayResult: vi.fn(),
  importExternalChatEvent: vi.fn(),
  recordExternalChatSourceEvent: vi.fn(),
  releaseExternalChatSourceEvent: vi.fn(),
  notifyChatMessageRecipients: vi.fn(),
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
  applyExternalChatMessageState: (...args: unknown[]) =>
    mocks.applyExternalChatMessageState(...args),
  importExternalChatEvent: (...args: unknown[]) =>
    mocks.importExternalChatEvent(...args),
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
  upsertExternalChatObservation: vi.fn(),
}));

vi.mock('@/lib/external-chat/source-events', () => ({
  claimExternalChatSourceEvent: (...args: unknown[]) =>
    mocks.claimExternalChatSourceEvent(...args),
  hydrateExternalChatReplayResult: (...args: unknown[]) =>
    mocks.hydrateExternalChatReplayResult(...args),
  recordExternalChatSourceEvent: (...args: unknown[]) =>
    mocks.recordExternalChatSourceEvent(...args),
  releaseExternalChatSourceEvent: (...args: unknown[]) =>
    mocks.releaseExternalChatSourceEvent(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  publishChatRealtimeEvent: (...args: unknown[]) =>
    mocks.publishChatRealtimeEvent(...args),
}));

vi.mock('@/lib/chat/notifications', () => ({
  notifyChatMessageRecipients: (...args: unknown[]) =>
    mocks.notifyChatMessageRecipients(...args),
}));

const wsId = 'd14c91ba-75b1-4f5d-ad0f-f837840e1e8f';
const recipientUserId = '5f42ae0f-f447-4619-bab6-1d98496ab5ef';
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
        settings: {
          chat: {
            agentMappings: {},
            authorityMode: 'legacy_primary',
            bridgeBaseUrl: 'https://bridge.example.com',
            enabled: true,
            inboxDefaults: {},
          },
        },
      },
      credentials: {
        configuration_revision: 7,
        ingest_secret_hash: 'active-hash',
        pending_action: 'set_ingest',
        pending_secret_hash: 'pending-hash',
        verified_at: '2026-08-01T17:00:00.000Z',
      },
    });
    mocks.claimExternalChatSourceEvent.mockResolvedValue({
      claimToken: 'claim-token',
      status: 'claimed',
    });
    mocks.hydrateExternalChatReplayResult.mockImplementation(
      async (result) => result
    );
    mocks.recordExternalChatSourceEvent.mockResolvedValue(undefined);
    mocks.releaseExternalChatSourceEvent.mockResolvedValue(undefined);
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
    mocks.notifyChatMessageRecipients.mockResolvedValue({
      createdCount: 1,
      failedCount: 0,
      recipientCount: 1,
    });
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

  it('routes an unmapped visitor to the configured inbox recipient', async () => {
    mocks.readExternalChatBinding.mockResolvedValueOnce({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: {
          chat: {
            agentMappings: {},
            authorityMode: 'legacy_primary',
            bridgeBaseUrl: 'https://bridge.example.com',
            enabled: true,
            inboxDefaults: { recipientUserId },
          },
        },
      },
      credentials: {
        configuration_revision: 7,
        ingest_secret_hash: 'active-hash',
        pending_action: null,
        pending_secret_hash: null,
        verified_at: '2026-08-01T17:00:00.000Z',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(201);
    expect(mocks.importExternalChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mappedUserId: recipientUserId })
    );
  });

  it('uses the inbox recipient when agent mappings are omitted', async () => {
    mocks.readExternalChatBinding.mockResolvedValueOnce({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: {
          chat: {
            authorityMode: 'legacy_primary',
            bridgeBaseUrl: 'https://bridge.example.com',
            enabled: true,
            inboxDefaults: { recipientUserId },
          },
        },
      },
      credentials: {
        configuration_revision: 7,
        ingest_secret_hash: 'active-hash',
        pending_action: null,
        pending_secret_hash: null,
        verified_at: '2026-08-01T17:00:00.000Z',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(201);
    expect(mocks.importExternalChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mappedUserId: recipientUserId })
    );
  });

  it('does not attribute unmapped staff messages to the inbox recipient', async () => {
    mocks.readExternalChatBinding.mockResolvedValueOnce({
      binding: {
        canonical_project_id: 'opaque-connector',
        is_enabled: true,
        settings: {
          chat: {
            agentMappings: {},
            authorityMode: 'legacy_primary',
            bridgeBaseUrl: 'https://bridge.example.com',
            enabled: true,
            inboxDefaults: { recipientUserId },
          },
        },
      },
      credentials: {
        configuration_revision: 7,
        ingest_secret_hash: 'active-hash',
        pending_action: null,
        pending_secret_hash: null,
        verified_at: '2026-08-01T17:00:00.000Z',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      eventRequest('old-secret', { ...validEvent, direction: 'staff' })
    );

    expect(response.status).toBe(201);
    expect(mocks.importExternalChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mappedUserId: null })
    );
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
    expect(mocks.notifyChatMessageRecipients).toHaveBeenCalledWith({
      actorUserId: null,
      conversation: { id: 'conversation-1' },
      message: {
        conversationId: 'conversation-1',
        id: 'native-message-1',
      },
      wsId,
    });
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

  it('republishes duplicate inbound events without notifying twice', async () => {
    mocks.importExternalChatEvent.mockResolvedValueOnce({
      conversation: { id: 'conversation-1' },
      conversationCreated: false,
      conversationId: 'conversation-1',
      duplicate: true,
      message: {
        conversationId: 'conversation-1',
        id: 'native-message-1',
      },
      messageId: 'native-message-1',
      threadId: 'thread-1',
    });
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret'));

    expect(response.status).toBe(200);
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('hydrates and republishes a live source-event replay from native ids', async () => {
    const stateEvent = {
      agentId: 'agent-1',
      deliveryMode: 'live',
      direction: 'visitor',
      eventId: 'state:message-1:seen',
      kind: 'message_state',
      messageId: 'message-1',
      status: 'seen',
      timestamp: new Date().toISOString(),
      version: 2,
      visitorId: 'visitor-1',
    };
    mocks.claimExternalChatSourceEvent.mockResolvedValueOnce({
      claimToken: 'claim-token',
      result: {
        messageId: 'native-message-1',
        threadId: 'thread-1',
      },
      status: 'duplicate',
    });
    mocks.hydrateExternalChatReplayResult.mockResolvedValueOnce({
      conversation: { id: 'conversation-1' },
      conversationId: 'conversation-1',
      message: {
        conversationId: 'conversation-1',
        id: 'native-message-1',
      },
      messageId: 'native-message-1',
      threadId: 'thread-1',
    });
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret', stateEvent));

    expect(response.status).toBe(200);
    expect(mocks.applyExternalChatMessageState).not.toHaveBeenCalled();
    expect(mocks.hydrateExternalChatReplayResult).toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        type: 'message.updated',
        wsId,
      })
    );
    expect(mocks.notifyChatMessageRecipients).not.toHaveBeenCalled();
  });

  it('defers a live state event until its source message exists', async () => {
    const stateEvent = {
      agentId: 'agent-1',
      deliveryMode: 'live',
      direction: 'visitor',
      eventId: 'state:missing-message:seen',
      kind: 'message_state',
      messageId: 'missing-message',
      status: 'seen',
      timestamp: new Date().toISOString(),
      version: 2,
      visitorId: 'visitor-1',
    };
    mocks.applyExternalChatMessageState.mockResolvedValueOnce({ found: false });
    const { POST } = await import('./route');
    const response = await POST(eventRequest('old-secret', stateEvent));

    expect(response.status).toBe(202);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(await response.json()).toEqual({
      error: 'external_chat_event_deferred',
    });
    expect(mocks.recordExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(mocks.releaseExternalChatSourceEvent).toHaveBeenCalled();
    expect(mocks.publishChatRealtimeEvent).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
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

  it('rejects deeply nested dynamic metadata before canonicalization', async () => {
    let context: Record<string, unknown> = {};
    for (let depth = 0; depth < 20; depth += 1) context = { nested: context };
    const { POST } = await import('./route');
    const response = await POST(
      eventRequest('old-secret', { ...validEvent, context })
    );

    expect(response.status).toBe(400);
    expect(mocks.claimExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(mocks.importExternalChatEvent).not.toHaveBeenCalled();
  });
});
