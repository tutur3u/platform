// @vitest-environment node
import { mapToUIMessages } from '@tuturuuu/ai/chat/google/chat-request-schema';
import { prepareProcessedMessages } from '@tuturuuu/ai/chat/google/route-message-preparation';
import { persistAssistantResponse } from '@tuturuuu/ai/chat/google/stream-finish-persistence';
import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assistantMessage,
  conversation,
  createRequest,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  deductAiCredits: vi.fn(),
}));

const batchSchema = z.object({
  p_messages: z.array(
    z.object({
      content: z.string(),
      metadata: z.record(z.string(), z.unknown()),
    })
  ),
  p_request_id: z.string(),
});
const aiBodySchema = z.object({
  id: z.string(),
  persistenceRequestId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['assistant', 'user']),
      parts: z.array(
        z.object({ type: z.string(), text: z.string().optional() })
      ),
    })
  ),
});

beforeEach(resetMessageRouteMocks);

it('keeps USER content authoritative when metadata claims a reply preview', async () => {
  const { toAiChatUiMessages, toNativeAiUiMessages } = await import(
    './ai-message-shared'
  );
  const message = {
    ...userMessage,
    kind: 'user' as const,
    metadata: {
      ai: { contentTruncated: true, parts: [{ type: 'text', text: 'Other' }] },
    },
  };
  for (const prepare of [toAiChatUiMessages, toNativeAiUiMessages]) {
    expect(
      prepare([message]).find((item) => item.role === 'user')?.parts
    ).toEqual([{ type: 'text', text: userMessage.content }]);
  }
});

it('saves long completed replies, reopens, and sends a follow-up with the full prior answer', async () => {
  const saved: Array<typeof assistantMessage | typeof userMessage> = [];
  const shadowRows: Record<string, unknown>[] = [];
  let currentUser = { ...userMessage };
  const reply = `${'A'.repeat(10_000)}The ending is required for the follow-up.`;
  mocks.auth.supabase = {
    from: () => {
      let chatId: unknown;
      const query = {
        select: () => query,
        eq: (name: string, value: unknown) => {
          if (name === 'chat_id') chatId = value;
          return query;
        },
        order: () => query,
        limit: async () => ({
          data: shadowRows.filter((row) => row.chat_id === chatId),
          error: null,
        }),
      };
      return query;
    },
  };
  mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
    const body = aiBodySchema.parse(await request.json());
    mocks.aiRouteBodies.push(body);
    const prepared = await prepareProcessedMessages(
      mapToUIMessages(body.messages),
      undefined,
      body.id
    );
    if ('error' in prepared) throw new Error(await prepared.error.text());
    if (mocks.aiRouteBodies.length === 2) {
      expect(
        body.messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.parts.some((part) => part.text === reply)
        )
      ).toBe(true);
    }
    await persistAssistantResponse({
      chatId: body.id,
      persistenceRequestId: body.persistenceRequestId,
      userId: 'user-1',
      model: 'subscription/model',
      effectiveSource: 'Mira',
      skipCreditDeduction: true,
      response: { finishReason: 'stop', text: reply },
      sbAdmin: {
        from: () => ({
          insert: (row) => ({
            select: () => ({
              single: async () => {
                if (Array.from(String(row.content)).length > 10_000) {
                  return {
                    data: null,
                    error: {
                      code: '23514',
                      message: 'ai_chat_messages_content_length_check',
                    },
                  };
                }
                shadowRows.push({ ...row, id: `shadow-${shadowRows.length}` });
                return {
                  data: { id: `shadow-${shadowRows.length - 1}` },
                  error: null,
                };
              },
            }),
          }),
        }),
      },
    });
    return new Response(
      `data: ${JSON.stringify({ type: 'text-delta', delta: reply })}\n\ndata: [DONE]\n\n`,
      {
        headers: { 'Content-Type': 'text/event-stream' },
      }
    );
  });
  mocks.callPrivateChatRpc.mockImplementation(
    async (name: string, args: unknown) => {
      if (name === 'chat_send_user_message_idempotent') {
        saved.push(currentUser);
        return { message: currentUser, replayed: false };
      }
      if (name === 'chat_get_conversation') return conversation;
      if (name === 'chat_list_messages') return structuredClone(saved);
      if (name === 'chat_persist_ai_message_batch_idempotent') {
        const batch = batchSchema.parse(args);
        const messages = batch.p_messages.map((item, index) => {
          expect(Array.from(item.content).length).toBeLessThanOrEqual(10_000);
          return {
            ...assistantMessage,
            ...item,
            id: `${batch.p_request_id}-reply-${index}`,
          };
        });
        saved.push(...messages);
        return { messages, replayed: false };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  );
  const { GET, POST } = await import('./route');
  const context = {
    params: Promise.resolve({
      conversationId: conversation.id,
      wsId: 'workspace-1',
    }),
  };
  for (let turn = 1; turn <= 2; turn++) {
    const clientRequestId = `11111111-1111-4111-8111-${String(turn).padStart(12, '0')}`;
    currentUser = {
      ...userMessage,
      id: `message-${turn}`,
      content: `Prompt ${turn}`,
      metadata: { clientRequestId },
    };
    const request = new Request(createRequest(), {
      body: JSON.stringify({ content: currentUser.content, clientRequestId }),
    });
    const response = await POST(request as never, context);
    expect(response.status).toBe(201);
    const receipt = await response.json();
    expect(receipt.message.metadata.ai.parts).toContainEqual({
      type: 'text',
      text: reply,
    });
    const reopened = await GET(
      new Request('http://localhost/messages') as never,
      context
    );
    expect(reopened.status).toBe(200);
    const history = await reopened.json();
    expect(history.messages).toHaveLength(turn * 2);
    expect(history.messages.at(-1).metadata.ai.parts).toContainEqual({
      type: 'text',
      text: reply,
    });
  }
  expect(mocks.aiRouteBodies).toHaveLength(2);
});
