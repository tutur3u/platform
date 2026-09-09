import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generate,
}));

import { answerMeetChat } from './chat';

const model = {
  id: 'google/gemini-3.1-flash-lite',
  providerModelId: 'gemini-3.1-flash-lite',
  inputPricePerToken: 0.25 / 1e6,
  outputPricePerToken: 1.5 / 1e6,
  cacheReadPricePerToken: null,
  tieredPricing: false,
};
const context = {
  title: 'Test',
  observedAt: '2026-09-09T04:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  participantCount: 2,
  deviceCount: 3,
  participants: [],
};
const result = () => ({
  text: 'Answer',
  sources: [],
  content: [],
  toolCalls: [],
  responseMessages: [],
  steps: [
    {
      toolCalls: [],
      providerMetadata: {
        google: {
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
        },
      },
    },
  ],
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('provides live tools, truthful time context, and a bounded generation loop', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  mocks.generate.mockResolvedValue(result());
  const answer = await answerMeetChat(
    [],
    900,
    'what day is today?',
    model,
    context
  );
  const input = mocks.generate.mock.calls[0]![0];
  expect(input.tools).not.toHaveProperty('select_workspace_tools');
  expect(input.tools).toHaveProperty('get_current_time');
  expect(input.tools).toHaveProperty('get_meeting_context');
  expect(input.tools).toHaveProperty('google_search');
  expect(input.maxOutputTokens).toBe(225);
  expect(input.messages[0].content).toContain('currentUtc');
  expect(input.prepareStep({ stepNumber: 2 })).toMatchObject({
    toolChoice: 'none',
  });
  expect(answer.privateResult).toBe(false);
});
it('keeps pending workspace approvals private even if no normal tool-call list is emitted', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  mocks.generate.mockResolvedValue({
    ...result(),
    content: [
      {
        type: 'tool-approval-request',
        approvalId: 'approval',
        toolCall: { toolName: 'create_task', input: { name: 'Test' } },
      },
    ],
  });
  const workspaceTools = {
    create_task: { inputSchema: {}, execute: vi.fn() },
  } as never;
  const answer = await answerMeetChat(
    [],
    900,
    'create a task',
    model,
    context,
    { workspaceTools }
  );
  const input = mocks.generate.mock.calls[0]![0];
  expect(input.toolApproval({ toolCall: { toolName: 'create_task' } })).toBe(
    'user-approval'
  );
  expect(answer.privateResult).toBe(true);
  expect(answer.approvals).toEqual([
    { id: 'approval', toolName: 'create_task', input: { name: 'Test' } },
  ]);
});
it('disables web search when continuing private workspace data and keeps the result private', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  mocks.generate.mockResolvedValue(result());
  const answer = await answerMeetChat([], 900, 'summarize', model, context, {
    messages: [{ role: 'user', content: 'Private result' }],
  });
  expect(mocks.generate.mock.calls[0]![0].tools).not.toHaveProperty(
    'google_search'
  );
  expect(answer.privateResult).toBe(true);
});
it('appends only provider-returned web sources', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  mocks.generate.mockResolvedValue({
    ...result(),
    sources: [
      {
        sourceType: 'url',
        url: 'https://example.com/info',
        title: 'Official information',
      },
      { sourceType: 'url', url: 'javascript:alert(1)', title: 'Bad' },
      { sourceType: 'url', url: 'https://[bad' },
    ],
  });
  const answer = await answerMeetChat([], 900, 'lookup', model, context);
  expect(answer.text).toContain(
    '[Official information](<https://example.com/info>)'
  );
  expect(answer.text).not.toContain('javascript:');
});

it('does not publish an outer-model answer when its search returned no grounded sources', async () => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic');
  mocks.generate
    .mockImplementationOnce(async (input) => {
      await input.tools.google_search.execute(
        {},
        {
          toolCallId: 'search',
          messages: [],
          context: {},
        }
      );
      return { ...result(), text: 'Invented current facts' };
    })
    .mockResolvedValueOnce({ ...result(), text: 'Unverified search facts' });
  const answer = await answerMeetChat([], 900, 'RMIT news', model, context);
  expect(answer.text).toContain('did not return verified sources');
  expect(answer.text).not.toContain('Invented');
  expect(answer.text).not.toContain('Unverified');
  expect(answer.usage.available).toBe(true);
  expect(answer.usage.inputTokens).toBe(200);
});
