import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRow = {
  chat_id: string;
  content: string;
  creator_id: string;
  metadata: Record<string, unknown>;
  role: string;
};

const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  rows: [] as StoredRow[],
  claims: [] as Record<string, unknown>[],
  streamText: vi.fn(),
}));

// Mirrors private.ai_chat_claim_persistence_request: a claim requires the
// request-scoped USER row to already exist.
const admin = {
  from: () => ({
    insert: async (row: StoredRow) => {
      mocks.rows.push(row);
      return { error: null };
    },
  }),
  schema: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'ai_chat_claim_persistence_request') {
        return { data: null, error: null };
      }
      mocks.claims.push(args);
      const saved = mocks.rows.some(
        (row) =>
          row.chat_id === args.p_chat_id &&
          row.creator_id === args.p_creator_id &&
          row.role === 'USER' &&
          row.metadata.requestId === args.p_request_id &&
          row.metadata.source === args.p_source
      );
      return saved
        ? { data: { state: 'claimed', retryAfterSeconds: 0 }, error: null }
        : {
            data: null,
            error: { message: 'ai_chat_persistence_user_message_missing' },
          };
    },
  }),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => admin,
}));
vi.mock('../../memory', () => ({ withAiMemory: vi.fn() }));
vi.mock('./route-auth', () => ({
  authorizeAiWorkspace: async () => ({ ok: true, wsId: null }),
  resolveAiRouteAuth: vi.fn(),
  isInternalTuturuuuAiUser: vi.fn(),
}));
vi.mock('./route-chat-resolution', () => ({
  resolveChatIdForUser: async () => ({ chatId: CHAT_ID }),
  moveTempFilesToThread: async () => null,
}));
vi.mock('./route-message-preparation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./route-message-preparation')>()),
  prepareProcessedMessages: async () => ({
    processedMessages: [{ role: 'user', content: "Today's focus" }],
  }),
}));
vi.mock('./route-mira-runtime', () => ({
  prepareMiraRuntime: async () => ({ miraTools: undefined }),
}));
vi.mock('./request-persistence-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./request-persistence-lease')>()),
  createAiPersistenceFinisher: () => vi.fn(),
  releaseAiPersistenceRequest: vi.fn(),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.streamText,
}));

import { createPOST } from './route';

function send(body: Record<string, unknown>) {
  const handler = createPOST({
    subscription: {
      resolveModel: async () => ({ modelId: 'synthetic' }) as never,
      onError: () => 'Subscription unavailable',
    },
    resolveAuth: async () => ({
      ok: true,
      supabase: {} as never,
      user: { id: USER_ID } as never,
    }),
  });
  return handler(
    new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        id: CHAT_ID,
        model: 'chatgpt/oaiapp_test/account-model',
        messages: [
          {
            id: REQUEST_ID,
            role: 'user',
            parts: [{ type: 'text', text: "Today's focus" }],
          },
        ],
        ...body,
      }),
    }) as NextRequest
  );
}

describe('request-scoped first turn persistence', () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.claims.length = 0;
    vi.clearAllMocks();
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream'),
    });
  });

  it('saves the only user message before claiming the persistence lease', async () => {
    const response = await send({ persistenceRequestId: REQUEST_ID });

    expect(response.status).toBe(200);
    expect(mocks.rows).toEqual([
      expect.objectContaining({
        chat_id: CHAT_ID,
        content: "Today's focus",
        creator_id: USER_ID,
        role: 'USER',
        metadata: expect.objectContaining({ requestId: REQUEST_ID }),
      }),
    ]);
    expect(mocks.claims).toHaveLength(1);
    expect(mocks.streamText).toHaveBeenCalledOnce();
  });

  it('keeps the creation-saved first turn unpersisted without a request id', async () => {
    const response = await send({});

    expect(response.status).toBe(200);
    expect(mocks.rows).toEqual([]);
    expect(mocks.claims).toEqual([]);
  });
});
