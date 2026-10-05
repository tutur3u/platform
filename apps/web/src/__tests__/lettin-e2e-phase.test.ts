import type { BrowserContext, Response } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { verifyLettinMarkdownPersistence } from '../../e2e/helpers/lettin-markdown-persistence';

const { playwrightExpect } = vi.hoisted(() => ({ playwrightExpect: vi.fn() }));
vi.mock('@playwright/test', () => ({
  expect: playwrightExpect,
  test: { step: (_name: string, action: () => Promise<unknown>) => action() },
}));
afterEach(() => {
  vi.restoreAllMocks();
  playwrightExpect.mockReset();
});

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
    ['[lettin-e2e] create Markdown page: started'],
    ['[lettin-e2e] create Markdown page: completed'],
    ['[lettin-e2e] open wiki: started'],
    ['[lettin-e2e] open wiki: completed'],
    ['[lettin-e2e] create project: started'],
  ]);
  expect(warn.mock.calls).toEqual([
    [
      '[lettin-e2e] create project: failed',
      { name: 'Error', message: 'operation failed' },
    ],
  ]);
});

test.each(['navigation', 'click'] as const)(
  '%s failure retains deadlines and exposes only its distinct phase',
  async (failureAt) => {
    const failure = new Error(
      `${failureAt === 'navigation' ? 'toHaveURL' : 'locator.click'}: https://synthetic.example.test/private?token=do-not-log response body do-not-log`
    );
    failure.name = 'TimeoutError';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toHaveURL = vi.fn().mockImplementation(async () => {
      if (failureAt === 'navigation') throw failure;
    });
    playwrightExpect.mockReturnValue({
      toBe: vi.fn(),
      toMatch: vi.fn(),
      toHaveURL,
    });
    const notebookClick = vi.fn().mockRejectedValue(failure);
    const page = {
      on: vi.fn(),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForResponse: vi.fn().mockResolvedValue({
        status: () => 200,
        text: async () => '',
        json: async () => ({ id: 'synthetic-project' }),
      }),
      getByRole: (_role: string, options?: { name: string }) => ({
        click:
          options?.name === 'World notebook'
            ? notebookClick
            : vi.fn().mockResolvedValue(undefined),
        getByLabel: () => ({ fill: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    await expect(
      verifyLettinMarkdownPersistence(
        { newPage: async () => page } as unknown as BrowserContext,
        'https://synthetic.example.test',
        'synthetic-workspace'
      )
    ).rejects.toBe(failure);
    expect(toHaveURL).toHaveBeenCalledWith(expect.any(RegExp), {
      timeout: 30_000,
    });
    if (failureAt === 'navigation')
      expect(notebookClick).not.toHaveBeenCalled();
    else expect(notebookClick).toHaveBeenCalledWith({ timeout: 15_000 });
    expect(warn.mock.calls).toEqual([
      [
        `[lettin-e2e] ${failureAt === 'navigation' ? 'confirm project navigation' : 'open notebook'}: failed`,
        {
          name: 'TimeoutError',
          message:
            failureAt === 'navigation'
              ? 'navigation URL assertion failed'
              : 'locator click failed',
        },
      ],
    ]);
    expect(
      JSON.stringify([...warn.mock.calls, ...info.mock.calls])
    ).not.toContain('do-not-log');
  }
);

test('page creation rejection reports its phase without exposing the browser error', async () => {
  const failure = new Error(
    'https://private.example.test/session?token=do-not-log'
  );
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const newPage = vi.fn().mockRejectedValue(failure);
  await expect(
    verifyLettinMarkdownPersistence(
      { newPage } as unknown as BrowserContext,
      'https://synthetic.example.test',
      'synthetic-workspace'
    )
  ).rejects.toBe(failure);
  expect(newPage).toHaveBeenCalledOnce();
  expect(info.mock.calls).toEqual([
    ['[lettin-e2e] create Markdown page: started'],
  ]);
  expect(warn.mock.calls).toEqual([
    [
      '[lettin-e2e] create Markdown page: failed',
      { name: 'Error', message: 'operation failed' },
    ],
  ]);
  expect(
    JSON.stringify([...info.mock.calls, ...warn.mock.calls])
  ).not.toContain('do-not-log');
});
