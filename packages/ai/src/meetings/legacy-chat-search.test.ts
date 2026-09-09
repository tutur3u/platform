import { expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: generate,
}));

import { legacyMeetSearch } from './legacy-chat-search';

it('isolates native search for legacy models and records nested usage without repeating requests', async () => {
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
  const search = legacyMeetSearch(
    'google/gemini-2.5-flash',
    256,
    AbortSignal.timeout(1000)
  );
  expect(
    await search.tool.execute!(
      { query: 'RMIT Vietnam' },
      { toolCallId: 'search', messages: [], context: {} }
    )
  ).toMatchObject({ answer: 'Public answer' });
  expect(generate.mock.calls[0]![0].tools.google_search.type).toBe('provider');
  expect(search.steps).toEqual(steps);
  expect(
    await search.tool.execute!(
      { query: 'another' },
      { toolCallId: 'second', messages: [], context: {} }
    )
  ).toHaveProperty('error');
  expect(generate).toHaveBeenCalledOnce();
});
