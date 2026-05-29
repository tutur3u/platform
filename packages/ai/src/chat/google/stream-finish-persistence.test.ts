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

  it('marks finished tool calls without explicit outputs as completed', async () => {
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
                input: { query: 'latest updates' },
                toolCallId: 'search-1',
                toolName: 'google_search',
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

    const payload = insert.mock.calls[0]?.[0] as {
      metadata: { ai: { parts: Record<string, unknown>[] } };
    };

    expect(payload.metadata.ai.parts).toContainEqual(
      expect.objectContaining({
        output: null,
        state: 'output-available',
        toolCallId: 'search-1',
        toolName: 'google_search',
      })
    );
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
});
