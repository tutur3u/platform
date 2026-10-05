import type { BrowserContext } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { verifyLettinPrivateImport } from '../../e2e/helpers/lettin-private-import';

vi.mock('@playwright/test', () => ({
  test: { step: (_name: string, action: () => Promise<unknown>) => action() },
}));
afterEach(() => vi.restoreAllMocks());

test('import dialog action is bounded and preserves its failure through cleanup', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const failure = new Error('locator.click private-provider-value');
  const goto = vi.fn().mockResolvedValue(undefined);
  const click = vi.fn().mockRejectedValue(failure);
  const setDefaultTimeout = vi.fn();
  const close = vi.fn().mockRejectedValue(new Error('private-cleanup-value'));
  const context = {
    setDefaultTimeout,
    close,
    newPage: async () => ({ goto, getByRole: () => ({ click }) }),
  } as unknown as BrowserContext;
  await expect(
    verifyLettinPrivateImport(
      context,
      'https://synthetic.test',
      'synthetic-workspace'
    )
  ).rejects.toBe(failure);
  expect(setDefaultTimeout).toHaveBeenCalledWith(15_000);
  expect(goto).toHaveBeenCalledWith(
    'https://synthetic.test/synthetic-workspace/wiki',
    { timeout: 60_000 }
  );
  expect(close).toHaveBeenCalledOnce();
  expect(info.mock.calls.at(-1)).toEqual([
    '[lettin-e2e] open import dialog: started',
  ]);
  expect(warn.mock.calls[0]).toEqual([
    '[lettin-e2e] open import dialog: failed',
    { name: 'Error', message: 'locator click failed' },
  ]);
  expect(
    JSON.stringify([...info.mock.calls, ...warn.mock.calls])
  ).not.toContain('private-');
});
