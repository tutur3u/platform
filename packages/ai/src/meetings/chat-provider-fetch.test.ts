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
  title: 'Synthetic room',
  observedAt: '2026-11-20T00:00:00Z',
  timezone: 'UTC',
  participantCount: 2,
  deviceCount: 2,
  participants: [],
};
const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] },
];
type Call = {
  prompt?: string;
  model: { doGenerate: (options: unknown) => Promise<unknown> };
  tools?: Record<
    string,
    { execute?: (input: unknown, options: unknown) => Promise<unknown> }
  >;
};
afterEach(() => vi.clearAllMocks());

it('sends every model step and the model-backed search through the injected provider fetch', async () => {
  const fetch = vi.fn(async () => {
    throw new Error('synthetic consent refused');
  });
  mocks.generate.mockImplementation(async (call: Call) => {
    if (typeof call.prompt !== 'string') {
      // Main loop: three model steps, then the search tool, whose own
      // generation (a string prompt) is the branch below.
      for (let step = 0; step < 3; step++)
        await call.model.doGenerate({ prompt }).catch(() => undefined);
      await call.tools?.google_search
        ?.execute?.({}, { toolCallId: 'search', messages: [] })
        .catch(() => undefined);
    } else await call.model.doGenerate({ prompt });
    return {
      text: 'Answer',
      sources: [],
      content: [],
      toolCalls: [],
      responseMessages: [],
      steps: [],
    };
  });
  await answerMeetChat(
    [],
    900,
    'What is the capital of France?',
    model,
    context,
    {
      provider: {
        apiKey: 'synthetic',
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
    }
  );
  // 3 main steps + 1 search request, each through the guarded fetch.
  expect(fetch).toHaveBeenCalledTimes(4);
  for (const [url] of fetch.mock.calls as unknown as [string][])
    expect(String(url)).toContain('generativelanguage.googleapis.com');
});
