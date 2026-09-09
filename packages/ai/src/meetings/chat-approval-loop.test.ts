import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock('@ai-sdk/google', async (original) => ({
  ...(await original<typeof import('@ai-sdk/google')>()),
  createGoogleGenerativeAI: () => () => mocks.model,
}));

import { answerMeetChat } from './chat';

afterEach(() => vi.unstubAllEnvs());
it('can request approval after checking time and selecting a workspace tool without executing it', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  const execute = vi.fn();
  const calls = [
    { toolName: 'get_current_time', input: '{}' },
    { toolName: 'select_workspace_tools', input: '{"names":["create_task"]}' },
    { toolName: 'create_task', input: '{"name":"Synthetic task"}' },
  ];
  let step = 0;
  const provider = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const call = calls[step++]!;
      return {
        content:
          options.toolChoice?.type === 'none'
            ? [{ type: 'text' as const, text: 'No action requested' }]
            : [
                {
                  type: 'tool-call' as const,
                  toolCallId: `call-${step}`,
                  ...call,
                },
              ],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        providerMetadata: {
          google: {
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          },
        },
        warnings: [],
      };
    },
  });
  mocks.model = provider;
  const result = await answerMeetChat(
    [],
    1024,
    'Create a task for tomorrow',
    {
      id: 'google/gemini-3.1-flash-lite',
      providerModelId: 'gemini-3.1-flash-lite',
      inputPricePerToken: 0.25 / 1e6,
      outputPricePerToken: 1.5 / 1e6,
      cacheReadPricePerToken: null,
      tieredPricing: false,
    },
    {
      title: 'Test',
      observedAt: new Date().toISOString(),
      timezone: 'UTC',
      participantCount: 1,
      deviceCount: 1,
      participants: [],
    },
    {
      workspaceTools: {
        create_task: tool({
          inputSchema: z.object({ name: z.string() }),
          execute,
        }),
      },
    }
  );
  expect(result.privateResult).toBe(true);
  expect(result.approvals).toEqual([
    expect.objectContaining({
      toolName: 'create_task',
      input: { name: 'Synthetic task' },
    }),
  ]);
  expect(execute).not.toHaveBeenCalled();
  expect(provider.doGenerateCalls).toHaveLength(3);
});
