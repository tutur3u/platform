import type { BrowserContext } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { verifyLettinPrivateImport } from '../../e2e/helpers/lettin-private-import';

const { step, browserExpect } = vi.hoisted(() => ({
  step: vi.fn(),
  browserExpect: vi.fn(),
}));
vi.mock('@playwright/test', () => ({
  test: { step },
  expect: browserExpect,
}));
afterEach(() => {
  vi.restoreAllMocks();
  step.mockReset();
  browserExpect.mockReset();
});

test('import dialog action is bounded and preserves its failure through cleanup', async () => {
  step.mockImplementation((_name, action) => action());
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
  expect(info.mock.calls.slice(-2)).toEqual([
    ['[lettin-e2e] open import dialog: started'],
    ['[lettin-e2e] close import context: started'],
  ]);
  expect(warn.mock.calls[0]).toEqual([
    '[lettin-e2e] open import dialog: failed',
    { name: 'Error', message: 'locator click failed' },
  ]);
  expect(
    JSON.stringify([...info.mock.calls, ...warn.mock.calls])
  ).not.toContain('private-');
});

for (const stalledPhase of [
  'confirm canonical preview',
  'confirm imported navigation',
  'confirm imported privacy',
]) {
  test(`${stalledPhase} is inside a bounded step and retains its timeout through cleanup`, async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('synthetic phase deadline');
    failure.name = 'TimeoutError';
    let enteredPhase = '';
    let blockedOperation = false;
    step.mockImplementation(async (name, action, options) => {
      enteredPhase = name;
      expect(options).toEqual({ timeout: 60_000 });
      if (name !== stalledPhase) return action();
      // Model instrumentation or response-body work that never settles. The
      // public step must own that await rather than only the preceding click.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          action(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(failure), 20);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    });
    const operation = () => {
      if (enteredPhase === stalledPhase) {
        blockedOperation = true;
        return new Promise<never>(() => {});
      }
      return Promise.resolve();
    };
    browserExpect.mockImplementation((value) => ({
      toBeVisible: operation,
      toHaveURL: operation,
      toContainText: operation,
      toEqual: vi.fn(),
      toBe: (expected: unknown) => expect(value).toBe(expected),
    }));
    const click = vi.fn().mockResolvedValue(undefined);
    const control = {
      fill: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      setInputFiles: vi.fn().mockResolvedValue(undefined),
      click,
    };
    const dialog = {
      getByRole: () => control,
      getByLabel: () => control,
      getByText: () => control,
    };
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForResponse: vi.fn().mockResolvedValue({ status: () => 200 }),
      getByRole: (role: string) => (role === 'dialog' ? dialog : control),
      locator: () => control,
      url: () => 'https://synthetic.test/wiki/synthetic-world/overview',
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const json = vi.fn(operation);
    const get = vi.fn().mockResolvedValue({ json, status: () => 200 });
    const context = {
      setDefaultTimeout: vi.fn(),
      newPage: async () => page,
      close,
      request: { get },
    } as unknown as BrowserContext;
    await expect(
      verifyLettinPrivateImport(
        context,
        'https://synthetic.test',
        'synthetic-workspace'
      )
    ).rejects.toBe(failure);
    expect(blockedOperation).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    const phases = step.mock.calls.map(([name]) => name);
    expect(phases.at(-1)).toBe(stalledPhase);
    if (stalledPhase === 'confirm canonical preview') {
      expect(phases).not.toContain('apply private import');
    }
    if (stalledPhase === 'confirm imported privacy') {
      expect(get).toHaveBeenCalledWith(
        'https://synthetic.test/api/v1/lettin/worlds?worldId=synthetic-world',
        { timeout: 30_000 }
      );
      expect(json).toHaveBeenCalledOnce();
    }
  });
}

test.each([200, 401, 403, 500])(
  'import privacy requires a successful response before parsing status %s',
  async (status) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    step.mockImplementation((_name, action) => action());
    browserExpect.mockImplementation((value) => ({
      toBeVisible: async () => {},
      toHaveURL: async () => {},
      toContainText: async () => {},
      toBe: (expected: unknown) => expect(value).toBe(expected),
      toEqual: (expected: unknown) => expect(value).toEqual(expected),
    }));
    const control = {
      fill: async () => {},
      selectOption: async () => {},
      setInputFiles: async () => {},
      click: async () => {},
    };
    const dialog = {
      getByRole: () => control,
      getByLabel: () => control,
      getByText: () => control,
    };
    const page = {
      goto: async () => {},
      waitForResponse: vi.fn().mockResolvedValue({ status: () => 200 }),
      getByRole: (role: string) => (role === 'dialog' ? dialog : control),
      locator: () => control,
      url: () => 'https://synthetic.test/wiki/synthetic-world/overview',
    };
    // Even an empty error body must not look like a passing privacy assertion.
    const json = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const context = {
      setDefaultTimeout: vi.fn(),
      newPage: async () => page,
      close,
      request: { get: async () => ({ status: () => status, json }) },
    } as unknown as BrowserContext;
    const result = verifyLettinPrivateImport(
      context,
      'https://synthetic.test',
      'synthetic-workspace'
    );
    if (status === 200) {
      await expect(result).resolves.toBeUndefined();
      expect(json).toHaveBeenCalledOnce();
    } else {
      await expect(result).rejects.toThrow();
      expect(json).not.toHaveBeenCalled();
    }
    expect(close).toHaveBeenCalledOnce();
  }
);
