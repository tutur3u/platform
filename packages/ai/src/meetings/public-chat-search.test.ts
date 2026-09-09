import { expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: generate,
}));

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
  expect(search.steps).toEqual(steps);
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
