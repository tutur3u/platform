import { beforeEach, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeGoogleSearch } from './search';

const generate = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ generateText: generate, stepCountIs: vi.fn() }));
vi.mock('@ai-sdk/google', () => ({
  google: Object.assign(() => ({}), { tools: { googleSearch: () => ({}) } }),
}));
vi.mock('../../memory', () => ({ withAiMemory: async () => ({}) }));
const ctx = { userId: 'user', wsId: 'workspace' } as MiraToolContext;
beforeEach(() => generate.mockReset());

it('does not repeat a native server search because its name differs from google_search', async () => {
  generate.mockResolvedValue({
    text: 'Search completed',
    sources: [],
    steps: [{ toolResults: [{ toolName: 'server:GOOGLE_SEARCH_WEB' }] }],
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar help' }, ctx)
  ).toMatchObject({ ok: true });
  expect(generate).toHaveBeenCalledOnce();
});

it('accepts grounded sources from providers without explicit search-call events', async () => {
  generate.mockResolvedValue({
    text: 'Calendar sharing help',
    sources: [
      {
        url: 'https://support.google.com/calendar/answer/37082',
        title: 'Share your calendar',
      },
    ],
    steps: [],
  });
  expect(
    await executeGoogleSearch({ query: 'Calendar sharing help' }, ctx)
  ).toMatchObject({ ok: true, sourceCount: 1 });
  expect(generate).toHaveBeenCalledOnce();
});
