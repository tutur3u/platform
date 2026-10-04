import type { BrowserContext, Response } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { verifyLettinMarkdownPersistence } from '../../e2e/helpers/lettin-markdown-persistence';

vi.mock('@playwright/test', () => ({
  test: { step: (_name: string, action: () => Promise<unknown>) => action() },
}));
afterEach(() => vi.restoreAllMocks());

test('creation wait is bounded and failure reports only its fixed phase', async () => {
  const failure = new Error('private provider diagnostic');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const click = vi.fn().mockResolvedValue(undefined);
  const fill = vi.fn().mockResolvedValue(undefined);
  const waitForResponse = vi.fn().mockRejectedValue(failure);
  const page = {
    on: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForResponse,
    getByRole: () => ({ click, getByLabel: () => ({ fill }) }),
  };
  const context = { newPage: async () => page } as unknown as BrowserContext;
  await expect(
    verifyLettinMarkdownPersistence(
      context,
      'https://synthetic.example.test',
      'synthetic-workspace'
    )
  ).rejects.toBe(failure);
  expect(waitForResponse).toHaveBeenCalledWith(expect.any(Function), {
    timeout: 30_000,
  });
  const predicate = waitForResponse.mock.calls[0]![0] as (
    response: Response
  ) => boolean;
  const response = (method: string, pathname: string) =>
    ({
      request: () => ({ method: () => method }),
      url: () => `https://synthetic.example.test${pathname}`,
    }) as unknown as Response;
  expect(
    predicate(response('POST', '/api/v1/workspaces/synthetic-workspace/lettin'))
  ).toBe(true);
  expect(
    predicate(response('GET', '/api/v1/workspaces/synthetic-workspace/lettin'))
  ).toBe(false);
  expect(predicate(response('POST', '/api/v1/workspaces/other/lettin'))).toBe(
    false
  );
  expect(info.mock.calls).toEqual([
    ['[lettin-e2e] open wiki: started'],
    ['[lettin-e2e] open wiki: completed'],
    ['[lettin-e2e] create project: started'],
  ]);
  expect(warn.mock.calls).toEqual([['[lettin-e2e] create project: failed']]);
});
