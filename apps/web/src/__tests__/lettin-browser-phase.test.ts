import { afterEach, expect, test, vi } from 'vitest';
import {
  LETTIN_BROWSER_PHASE_TIMEOUT_MS,
  runLettinBrowserPhase,
} from '../../e2e/helpers/lettin-browser-phase';

const { step } = vi.hoisted(() => ({ step: vi.fn() }));
vi.mock('@playwright/test', () => ({ test: { step } }));
afterEach(() => {
  vi.restoreAllMocks();
  step.mockReset();
});

function muteDiagnostics() {
  return {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  };
}

test('public step receives a finite whole-phase cap and preserves the result', async () => {
  const { info, warn } = muteDiagnostics();
  step.mockImplementation((_name, action) => action());
  const action = vi.fn().mockResolvedValue('persisted');
  await expect(
    runLettinBrowserPhase('reload persisted Markdown', action)
  ).resolves.toBe('persisted');
  expect(step).toHaveBeenCalledWith('reload persisted Markdown', action, {
    timeout: 60_000,
  });
  expect(LETTIN_BROWSER_PHASE_TIMEOUT_MS).toBe(60_000);
  expect(info.mock.calls).toEqual([
    ['[lettin-e2e] reload persisted Markdown: started'],
    ['[lettin-e2e] reload persisted Markdown: completed'],
  ]);
  expect(warn).not.toHaveBeenCalled();
});

test('ordinary action failure remains the original error with safe diagnostics', async () => {
  const { info, warn } = muteDiagnostics();
  step.mockImplementation((_name, action) => action());
  const failure = new Error('locator.click private-token private-response');
  await expect(
    runLettinBrowserPhase('open import dialog', async () => {
      throw failure;
    })
  ).rejects.toBe(failure);
  expect(warn.mock.calls).toEqual([
    [
      '[lettin-e2e] open import dialog: failed',
      { name: 'Error', message: 'locator click failed' },
    ],
  ]);
  expect(
    JSON.stringify([...info.mock.calls, ...warn.mock.calls])
  ).not.toContain('private-');
});

test('public step timeout rejection preserves the failure and safe phase diagnostics', async () => {
  const { info, warn } = muteDiagnostics();
  const failure = new Error('Step timeout: private-browser-detail');
  failure.name = 'TimeoutError';
  step.mockRejectedValue(failure);
  const action = vi.fn(() => new Promise<never>(() => {}));
  await expect(
    runLettinBrowserPhase('reload persisted Markdown', action)
  ).rejects.toBe(failure);
  expect(step).toHaveBeenCalledWith('reload persisted Markdown', action, {
    timeout: 60_000,
  });
  expect(info.mock.calls).toEqual([
    ['[lettin-e2e] reload persisted Markdown: started'],
  ]);
  expect(warn.mock.calls).toEqual([
    [
      '[lettin-e2e] reload persisted Markdown: failed',
      { name: 'TimeoutError', message: 'operation timed out' },
    ],
  ]);
  expect(
    JSON.stringify([...info.mock.calls, ...warn.mock.calls])
  ).not.toContain('private-browser-detail');
});
