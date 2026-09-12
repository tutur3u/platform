import { tool } from 'ai';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { resolveChatTools } from './chat-tools';

it('keeps Mira search executable instead of overriding it with a native tool', () => {
  const search = tool({
    inputSchema: z.object({ query: z.string() }),
    execute: vi.fn(),
  });
  const tools = { google_search: search };
  expect(resolveChatTools(tools)).toBe(tools);
  expect(resolveChatTools(tools).google_search?.execute).toBe(search.execute);
});
it('retains native search for chat without Mira function tools', () => {
  const search = resolveChatTools().google_search;
  expect(search).toMatchObject({
    type: 'provider',
    id: 'google.google_search',
  });
});
