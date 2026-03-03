import { describe, expect, it, vi } from 'vitest';

const { deductAiCreditsMock } = vi.hoisted(() => ({
  deductAiCreditsMock: vi.fn(),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  deductAiCredits: deductAiCreditsMock,
}));

import { persistAssistantResponse } from './stream-finish-persistence';

describe('persistAssistantResponse', () => {
  it('persists a fallback reply when tool-only turns finish without assistant text', async () => {
    deductAiCreditsMock.mockResolvedValue({
      success: true,
    });

    let insertedPayload: Record<string, unknown> | null = null;
    const sbAdmin = {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          insertedPayload = payload;

          return {
            select: () => ({
              single: async () => ({
                data: { id: 'assistant-message-1' },
                error: null,
              }),
            }),
          };
        },
      }),
    };

    await persistAssistantResponse({
      chatId: 'chat-1',
      effectiveSource: 'Mira',
      model: 'google/gemini-3.1-flash-lite-preview',
      response: {
        steps: [
          {
            toolCalls: [{ toolName: 'recall' }],
            toolResults: [{ ok: true }],
          },
        ],
        text: '',
        totalUsage: {
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: 0,
        },
      },
      sbAdmin: sbAdmin as never,
      userId: 'user-1',
      wsId: 'ws-1',
    });

    expect(insertedPayload).toEqual(
      expect.objectContaining({
        content: expect.stringContaining(
          'I checked the saved context for this turn'
        ),
      })
    );
  });
});
