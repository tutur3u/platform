// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailSyncStatus } from './mail-sync-status';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const error = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  { state: 'synced' as const, refreshing: false, label: 'synced', calls: 1 },
  {
    state: 'failed' as const,
    refreshing: false,
    label: 'sync_failed',
    calls: 1,
  },
  { state: 'syncing' as const, refreshing: false, label: 'syncing', calls: 0 },
  { state: 'synced' as const, refreshing: true, label: 'syncing', calls: 0 },
  { state: 'failed' as const, refreshing: true, label: 'syncing', calls: 0 },
])('exposes $label and refreshes only when idle ($refreshing)', (test) => {
  const onRefresh = vi.fn();
  render(
    createElement(
      TooltipProvider,
      null,
      createElement(MailSyncStatus, {
        state: test.state,
        refreshing: test.refreshing,
        onRefresh,
      })
    )
  );
  const button = screen.getByRole('button', { name: `refresh: ${test.label}` });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(button);
  expect(onRefresh).toHaveBeenCalledTimes(test.calls);
  expect(error).toHaveBeenCalledTimes(
    test.state === 'failed' && !test.refreshing ? 1 : 0
  );
});

it('deduplicates immediate activations until the refresh settles', async () => {
  let finish!: () => void;
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  render(
    createElement(
      TooltipProvider,
      null,
      createElement(MailSyncStatus, {
        state: 'synced',
        refreshing: false,
        onRefresh,
      })
    )
  );
  const button = screen.getByRole('button');
  fireEvent.click(button);
  fireEvent.click(button);
  expect(onRefresh).toHaveBeenCalledOnce();
  await act(async () => {
    finish();
  });
  fireEvent.click(button);
  expect(onRefresh).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish();
  });
});
