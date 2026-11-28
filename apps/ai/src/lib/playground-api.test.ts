import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  playgroundPublicModels,
  playgroundRun,
  playgroundSavedKeyModels,
  playgroundSavedKeyRun,
} from './playground-api';

const BASE_GLOBAL = '__tuturuuuAppBase';
const input = {
  endpoint: 'responses' as const,
  maxOutputTokens: 16,
  maxSteps: 1,
  model: 'fixture/model',
  prompt: 'fixture',
  tools: [],
};
const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
  Response.json({ data: [], id: 'run', model: 'fixture/model' })
);

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal('fetch', fetcher);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>)[BASE_GLOBAL];
});

it.each([
  ['the subdomain', ''],
  ['the tuturuuu.com mount', '/ai'],
])('keeps every Playground call on %s', async (_label, base) => {
  (globalThis as Record<string, unknown>)[BASE_GLOBAL] = base;

  await playgroundPublicModels('ttr_ai_fixture');
  await playgroundRun('ttr_ai_fixture', input);
  await playgroundRun('ttr_ai_fixture', { ...input, endpoint: 'chat' });
  await playgroundSavedKeyModels('workspace one', 'key one');
  await playgroundSavedKeyRun('workspace one', 'key one', input);

  const saved = `${base}/api/v1/workspaces/workspace%20one/ai/playground`;
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    `${base}/v1/models`,
    `${base}/v1/responses`,
    `${base}/v1/chat/completions`,
    `${saved}?keyId=key%20one`,
    saved,
  ]);
});
