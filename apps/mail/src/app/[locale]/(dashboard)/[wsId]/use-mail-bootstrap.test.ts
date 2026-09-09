// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), counts: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMailBootstrap: mocks.bootstrap,
  getMailUnreadCounts: mocks.counts,
}));

import { useMailBootstrap } from './use-mail-bootstrap';

afterEach(cleanup);
describe('progressive Mail bootstrap', () => {
  it('exposes mailboxes before slow unread counts finish, keeping unknown counts distinct from zero', async () => {
    mocks.bootstrap.mockResolvedValue({
      user: { id: 'user' },
      labels: [],
      mailboxes: [{ id: 'box', unreadCount: null }],
    });
    mocks.counts.mockReturnValue(new Promise(() => {}));
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
  });
});
