import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deductAiCredits: vi.fn(),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

import {
  buildAbortedStreamFinishResponse,
  persistAssistantResponse,
} from './stream-finish-persistence';

describe('stream finish persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      remainingCredits: 99,
      success: true,
    });
  });

  it.each(['google_search', 'server:GOOGLE_SEARCH_WEB'])(
    'persists and accounts for completed %s calls',
    async (toolName) => {
      const insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'assistant-message-1' },
            error: null,
          }),
        }),
      });
      const sbAdmin = {
        from: vi.fn().mockReturnValue({ insert }),
      };

      const persisted = await persistAssistantResponse({
        chatId: 'chat-1',
        effectiveSource: 'Mira',
        model: 'google/gemini-3-flash',
        persistenceRequestId: '11111111-1111-4111-8111-111111111111',
        response: {
          finishReason: 'stop',
          steps: [
            {
              toolCalls: [
                {
                  input: { query: 'latest updates' },
                  toolCallId: 'search-1',
                  toolName,
                },
              ],
              usage: { inputTokens: 10, outputTokens: 2 },
            },
          ],
          text: 'Done.',
        },
        sbAdmin,
        userId: 'user-1',
        wsId: 'workspace-1',
      });

      expect(persisted).toBe(true);
      expect(mocks.deductAiCredits).toHaveBeenCalledWith(
        expect.objectContaining({ searchCount: 1 })
      );

      const payload = insert.mock.calls[0]?.[0] as {
        metadata: {
          ai: { parts: Record<string, unknown>[] };
          requestId: string;
        };
      };

      expect(payload.metadata.requestId).toBe(
        '11111111-1111-4111-8111-111111111111'
      );
      expect(payload.metadata.ai.parts).toContainEqual(
        expect.objectContaining({
          state: 'input-available',
          toolCallId: 'search-1',
          toolName,
        })
      );
    }
  );

  it('reports empty streams as not persisted', async () => {
    const sbAdmin = { from: vi.fn() };

    await expect(
      persistAssistantResponse({
        chatId: 'chat-1',
        effectiveSource: 'Rewise',
        model: 'google/gemini-3-flash',
        response: { finishReason: 'stop', steps: [], text: '' },
        sbAdmin,
        userId: 'user-1',
      })
    ).resolves.toBe(false);
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });

  it('persists aborted streams with completed steps for credit deduction', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'assistant-message-2' },
          error: null,
        }),
      }),
    });
    const sbAdmin = {
      from: vi.fn().mockReturnValue({ insert }),
    };

    const response = buildAbortedStreamFinishResponse([
      {
        text: 'Partial answer',
        toolCalls: [
          {
            input: { tools: ['list_tasks'] },
            toolCallId: 'select-1',
            toolName: 'select_tools',
          },
        ],
        toolResults: [
          {
            output: { ok: true, selectedTools: ['list_tasks'] },
            toolCallId: 'select-1',
            toolName: 'select_tools',
          },
        ],
        usage: { inputTokens: 12, outputTokens: 5, reasoningTokens: 1 },
      },
    ]);

    await persistAssistantResponse({
      chatId: 'chat-1',
      effectiveSource: 'Mira',
      model: 'google/gemini-3-flash',
      response,
      sbAdmin,
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Partial answer',
        finish_reason: 'abort',
        prompt_tokens: 12,
        completion_tokens: 5,
      })
    );
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        chatMessageId: 'assistant-message-2',
        inputTokens: 12,
        outputTokens: 5,
        reasoningTokens: 1,
      })
    );
  });

  it('retries with compact metadata when the rollout still has strict metadata limits', async () => {
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '22001',
          message:
            'PAYLOAD_FIELD_BYTES_EXCEEDED: ai_chat_messages.metadata exceeds 16384 bytes',
        },
      })
      .mockResolvedValueOnce({
        data: { id: 'assistant-message-3' },
        error: null,
      });
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    const sbAdmin = {
      from: vi.fn().mockReturnValue({ insert }),
    };

    await persistAssistantResponse({
      chatId: 'chat-1',
      effectiveSource: 'Mira',
      model: 'google/gemini-3-flash',
      response: {
        finishReason: 'stop',
        steps: [
          {
            toolCalls: [
              {
                input: { text: 'x'.repeat(20_000) },
                toolCallId: 'qr-1',
                toolName: 'create_qr_code',
              },
            ],
            toolResults: [
              {
                output: { dataUrl: 'data:image/png;base64,'.repeat(2000) },
                toolCallId: 'qr-1',
                toolName: 'create_qr_code',
              },
            ],
            usage: { inputTokens: 10, outputTokens: 4 },
          },
        ],
        text: 'Here is the QR code.',
      },
      sbAdmin,
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ai: expect.objectContaining({ metadataCompacted: true }),
          toolCallCount: 1,
          toolResultCount: 1,
        }),
      })
    );
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({ chatMessageId: 'assistant-message-3' })
    );
  });

  it('saves all step text and chronology even when large metadata needs compaction', async () => {
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '22001',
          message:
            'PAYLOAD_FIELD_BYTES_EXCEEDED: ai_chat_messages.metadata exceeds 16384 bytes',
        },
      })
      .mockResolvedValueOnce({ data: { id: 'saved' }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    const steps = Array.from({ length: 12 }, (_, i) => ({
      text: `Text ${i}`,
      content: [
        { type: 'text', text: `Text ${i}` },
        {
          type: 'tool-call',
          toolName: 'lookup',
          toolCallId: `call-${i}`,
          input: {},
        },
      ],
      toolCalls: [{ toolName: 'lookup', toolCallId: `call-${i}`, input: {} }],
      toolResults: [
        {
          toolName: 'lookup',
          toolCallId: `call-${i}`,
          output: { data: 'x'.repeat(20000) },
        },
      ],
    }));
    await persistAssistantResponse({
      chatId: 'chat',
      userId: 'user',
      model: 'google/gemini-3.5-flash-lite',
      effectiveSource: 'Mira',
      sbAdmin: { from: () => ({ insert }) },
      response: { steps, text: 'Text 11' },
    });
    const [original, compact] = insert.mock.calls.map(([payload]) => payload);
    expect(original.content).toBe(steps.map((step) => step.text).join('\n\n'));
    expect(compact.metadata.ai.parts).toHaveLength(36);
    expect(compact.metadata.ai.parts.at(-1)).toMatchObject({
      toolCallId: 'call-11',
    });
    expect(compact.metadata.ai.parts[0]).toEqual({ type: 'step-start' });
    expect(compact.metadata.ai.parts[1]).toEqual({
      type: 'text',
      textStart: 0,
      textLength: 6,
    });
    expect(Buffer.byteLength(JSON.stringify(compact.metadata))).toBeLessThan(
      16384
    );
  });
});
