// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedChatSyncControls } from './sync-controls';

const internalApiMocks = vi.hoisted(() => ({
  getExternalChatSyncStatus: vi.fn(),
  mutateExternalChatSync: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getExternalChatSyncStatus: internalApiMocks.getExternalChatSyncStatus,
  mutateExternalChatSync: internalApiMocks.mutateExternalChatSync,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderControls(enabled = true) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return render(
    createElement(ConnectedChatSyncControls, {
      enabled,
      wsId: 'workspace-1',
    }),
    { wrapper }
  );
}

describe('ConnectedChatSyncControls', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    internalApiMocks.getExternalChatSyncStatus.mockResolvedValue({
      checkpoint: null,
      runs: [],
    });
    internalApiMocks.mutateExternalChatSync.mockResolvedValue({
      remote: {},
      runId: '8339a8f5-4ada-4fdb-b929-45ae9a76bffd',
    });
  });

  it('links a validated existing run from developer details', async () => {
    renderControls();
    await screen.findByText('sync_no_runs');

    const input = screen.getByPlaceholderText(
      '00000000-0000-0000-0000-000000000000'
    );
    const action = screen.getByRole('button', {
      name: 'sync_existing_run_action',
    });
    expect((action as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, {
      target: { value: '8339a8f5-4ada-4fdb-b929-45ae9a76bffd' },
    });
    expect((action as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(action);

    await waitFor(() =>
      expect(internalApiMocks.mutateExternalChatSync).toHaveBeenCalledWith(
        'workspace-1',
        {
          action: 'adopt',
          runId: '8339a8f5-4ada-4fdb-b929-45ae9a76bffd',
        }
      )
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('keeps adoption disabled until the connection is ready', () => {
    renderControls(false);
    fireEvent.change(
      screen.getByPlaceholderText('00000000-0000-0000-0000-000000000000'),
      { target: { value: '8339a8f5-4ada-4fdb-b929-45ae9a76bffd' } }
    );

    expect(
      (
        screen.getByRole('button', {
          name: 'sync_existing_run_action',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(internalApiMocks.getExternalChatSyncStatus).not.toHaveBeenCalled();
  });
});
