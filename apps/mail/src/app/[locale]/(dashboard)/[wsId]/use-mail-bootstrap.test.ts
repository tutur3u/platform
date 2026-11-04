// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), counts: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMailBootstrap: mocks.bootstrap,
  getMailUnreadCounts: mocks.counts,
}));

import { resolveActiveMailboxId } from './mail-mailbox-hint';
import { useMailBootstrap } from './use-mail-bootstrap';

afterEach(cleanup);
describe('progressive Mail bootstrap', () => {
  it('exposes mailboxes before slow unread counts finish, keeping unknown counts distinct from zero', async () => {
    mocks.bootstrap.mockResolvedValue({
      user: { id: 'user' },
      labels: [],
      mailboxes: [{ id: 'box', unreadCount: null }],
    });
    let resolveCounts!: (counts: Record<string, number | null>) => void;
    mocks.counts.mockReturnValue(
      new Promise((resolve) => {
        resolveCounts = resolve;
      })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useMailBootstrap('ws'), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.mailboxes).toEqual([
      { id: 'box', unreadCount: null },
    ]);
    expect(mocks.bootstrap).toHaveBeenCalledWith('ws', undefined, false);
    await waitFor(() => expect(mocks.counts).toHaveBeenCalledWith('ws'));
    await act(async () => resolveCounts({ box: 0 }));
    await waitFor(() =>
      expect(result.current.data?.mailboxes[0]?.unreadCount).toBe(0)
    );
  });

  it('waits for the first thread page before fanning out unread counts', async () => {
    mocks.counts.mockClear();
    mocks.bootstrap.mockResolvedValue({
      user: { id: 'user' },
      labels: [],
      mailboxes: [{ id: 'box', unreadCount: null }],
    });
    mocks.counts.mockResolvedValue({ box: 2 });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let resolveThreads!: (value: unknown) => void;
    void client.prefetchQuery({
      queryKey: ['mail', 'ws', 'box', 'threads', 'inbox'],
      queryFn: () =>
        new Promise((resolve) => {
          resolveThreads = resolve;
        }),
    });
    const { result } = renderHook(() => useMailBootstrap('ws'), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(
      window.localStorage.getItem('tuturuuu-mail-default-mailbox:ws')
    ).toBe('box');
    await act(async () => resolveThreads({ pages: [] }));
    await waitFor(() => expect(mocks.counts).toHaveBeenCalledWith('ws'));
  });
});

describe('resolveActiveMailboxId', () => {
  const mailboxes = [{ id: 'first' }, { id: 'second' }];

  it('starts from the URL or remembered default before bootstrap', () => {
    expect(
      resolveActiveMailboxId({
        hint: 'first',
        mailboxes: undefined,
        requested: 'second',
      })
    ).toBe('second');
    expect(
      resolveActiveMailboxId({
        hint: 'first',
        mailboxes: undefined,
        requested: null,
      })
    ).toBe('first');
  });

  it('only keeps mailboxes the bootstrap returned', () => {
    expect(
      resolveActiveMailboxId({ hint: 'stale', mailboxes, requested: 'stale' })
    ).toBe('first');
    expect(
      resolveActiveMailboxId({ hint: null, mailboxes, requested: 'second' })
    ).toBe('second');
    expect(
      resolveActiveMailboxId({ hint: null, mailboxes: [], requested: null })
    ).toBeNull();
  });
});
