// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMailRefresh } from './use-mail-refresh';

afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useMailRefresh', () => {
  it('stays refreshing until the list and mailbox refetches both settle', async () => {
    const threads = deferred();
    const mailboxes = deferred();
    const threadsQuery = {
      isFetching: false,
      refetch: vi.fn(() => threads.promise),
    };
    const bootstrapQuery = {
      isFetching: false,
      refetch: vi.fn(() => mailboxes.promise),
    };
    const client = new QueryClient();
    const { result } = renderHook(
      () =>
        useMailRefresh({
          bootstrapQuery,
          mailboxId: 'box',
          threadsQuery,
          workspaceId: 'ws',
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );

    let refresh!: Promise<unknown>;
    act(() => {
      refresh = result.current.refresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(true));

    await act(async () => threads.resolve());
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      mailboxes.resolve();
      await refresh;
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(threadsQuery.refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it('does not report a sync while only an older page is loading', () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () =>
        useMailRefresh({
          bootstrapQuery: { isFetching: false, refetch: vi.fn() },
          mailboxId: 'box',
          threadsQuery: {
            isFetching: true,
            isFetchingNextPage: true,
            refetch: vi.fn(),
          },
          workspaceId: 'ws',
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      }
    );
    expect(result.current.refreshing).toBe(false);
  });
});
