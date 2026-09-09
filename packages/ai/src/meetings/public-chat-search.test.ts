import { expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: generate,
}));

import { measureMeetGeneration } from './chat-generation-usage';
import { publicMeetSearch } from './public-chat-search';

it('isolates native search from room history and records nested usage without repeating requests', async () => {
  const steps = [
    {
      providerMetadata: {
        google: {
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
          groundingMetadata: { webSearchQueries: ['rmit'] },
        },
      },
    },
  ];
  generate.mockResolvedValue({
    text: 'Public answer',
    sources: [
      { sourceType: 'url', url: 'https://www.rmit.edu.vn/', title: 'RMIT' },
    ],
    steps,
  });
  const search = publicMeetSearch(
    'google/gemini-2.5-flash',
    256,
    AbortSignal.timeout(1000),
    'RMIT Vietnam'
  );
  expect(
    await search.tool.execute!(
      {},
      { toolCallId: 'search', messages: [], context: {} }
    )
  ).toMatchObject({ answer: 'Public answer' });
  expect(generate.mock.calls[0]![0].tools.google_search.type).toBe('provider');
  expect(search.steps).toMatchObject(steps);
  expect(
    await search.tool.execute!(
      {},
      { toolCallId: 'second', messages: [], context: {} }
    )
  ).toHaveProperty('error');
  expect(generate).toHaveBeenCalledOnce();
});

it('blocks participant details before calling search and ignores model-supplied queries', async () => {
  generate.mockClear();
  const blocked = publicMeetSearch(
    'google/gemini-2.5-flash',
    256,
    AbortSignal.timeout(1000),
    'find Nguyen online',
    ['Anh Nguyen']
  );
  expect(
    await blocked.tool.execute!(
      {},
      { toolCallId: 'blocked', messages: [], context: {} }
    )
  ).toHaveProperty('error');
  expect(generate).not.toHaveBeenCalled();
  const safe = publicMeetSearch(
    'google/gemini-2.5-flash',
    256,
    AbortSignal.timeout(1000),
    '@ttr RMIT Vietnam',
    ['Anh Nguyen']
  );
  await safe.tool.execute!({ query: 'private room detail' } as never, {
    toolCallId: 'safe',
    messages: [],
    context: {},
  });
  expect(generate.mock.calls[0]![0].prompt).toContain('RMIT Vietnam');
  expect(generate.mock.calls[0]![0].prompt).not.toContain(
    'private room detail'
  );
});
it('reports unavailable grounding instead of an unverified search answer', async () => {
  generate.mockResolvedValue({ text: 'Unverified', sources: [], steps: [] });
  const search = publicMeetSearch(
    'google/gemini-2.5-flash',
    256,
    AbortSignal.timeout(1000),
    'RMIT'
  );
  expect(
    await search.tool.execute!(
      {},
      { toolCallId: 'safe', messages: [], context: {} }
    )
  ).toHaveProperty('error');
});

it.each([
  ['Bo Li', 'Who is Bo Li?'],
  ['李伟', '李伟是谁？'],
])(
  'blocks short and unspaced participant names: %s',
  async (name, question) => {
    generate.mockClear();
    const search = publicMeetSearch(
      'google/gemini-3.1-flash-lite',
      256,
      AbortSignal.timeout(1000),
      question,
      [name]
    );
    expect(
      await search.tool.execute!(
        {},
        { toolCallId: 'blocked', messages: [], context: {} }
      )
    ).toHaveProperty('error');
    expect(generate).not.toHaveBeenCalled();
  }
);
it('keeps grounded sources usable while marking missing billing coverage incomplete', async () => {
  generate.mockResolvedValue({
    text: 'Grounded',
    sources: [{ sourceType: 'url', url: 'https://www.rmit.edu.vn/' }],
    steps: [
      {
        providerMetadata: {
          google: {
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          },
        },
        toolCalls: [],
      },
    ],
  });
  const search = publicMeetSearch(
    'google/gemini-3.1-flash-lite',
    256,
    AbortSignal.timeout(1000),
    'RMIT'
  );
  expect(
    await search.tool.execute!(
      {},
      { toolCallId: 'search', messages: [], context: {} }
    )
  ).toMatchObject({ answer: 'Grounded' });
  expect(
    measureMeetGeneration(search.steps, {
      id: 'google/gemini-3.1-flash-lite',
      providerModelId: 'gemini-3.1-flash-lite',
      inputPricePerToken: 0.25 / 1e6,
      outputPricePerToken: 1.5 / 1e6,
      cacheReadPricePerToken: null,
      tieredPricing: false,
    })
  ).toMatchObject({
    costUsd: null,
    searchCount: 1,
    usage: { available: true },
  });
});
it('retains unknown usage when a provider attempt fails and does not issue a duplicate attempt', async () => {
  generate.mockClear();
  generate.mockRejectedValue(new Error('Connection lost'));
  const search = publicMeetSearch(
    'google/gemini-3.1-flash-lite',
    256,
    AbortSignal.timeout(1000),
    'RMIT'
  );
  await expect(
    search.tool.execute!(
      {},
      { toolCallId: 'search', messages: [], context: {} }
    )
  ).rejects.toThrow('Connection lost');
  expect(search.steps).toEqual([{}]);
  expect(
    await search.tool.execute!(
      {},
      { toolCallId: 'retry', messages: [], context: {} }
    )
  ).toHaveProperty('error');
  expect(generate).toHaveBeenCalledOnce();
});
