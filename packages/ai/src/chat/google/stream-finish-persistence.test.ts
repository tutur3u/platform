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

  it('does not persist the text fallback for visual-only tool turns', async () => {
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
                data: { id: 'assistant-message-2' },
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
            toolCalls: [{ toolName: 'render_ui' }],
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
        content: expect.not.stringContaining(
          'I checked the saved context for this turn'
        ),
      })
    );
  });

  it('persists a successful tool summary when actions finish without assistant text', async () => {
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
                data: { id: 'assistant-message-3' },
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
            toolCalls: [
              { toolName: 'list_boards' },
              { toolName: 'list_task_lists' },
              { toolName: 'create_task' },
              { toolName: 'create_task' },
              { toolName: 'update_task' },
            ],
            toolResults: [
              { ok: true, output: { count: 1 }, toolName: 'list_boards' },
              { ok: true, output: { count: 4 }, toolName: 'list_task_lists' },
              {
                ok: true,
                output: { task: { name: 'Water the plants' } },
                toolName: 'create_task',
              },
              {
                ok: true,
                output: { task: { name: 'Organize the office desk' } },
                toolName: 'create_task',
              },
              {
                ok: true,
                output: { success: true },
                toolName: 'update_task',
              },
            ],
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
          'I created 2 tasks: Water the plants, Organize the office desk.'
        ),
      })
    );
    expect(insertedPayload).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('I also updated 1 task.'),
      })
    );
  });
});
