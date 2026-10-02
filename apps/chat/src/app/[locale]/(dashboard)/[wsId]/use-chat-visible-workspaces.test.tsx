import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ list: vi.fn(), hidden: vi.fn() }));
vi.mock('./actions', () => ({ fetchWorkspaces: f.list }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: f.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));

import { useChatVisibleWorkspaces } from './use-chat-visible-workspaces';

describe('Chat workspace discovery projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.list.mockResolvedValue([
      { id: 'visible' },
      { id: 'hidden', personal: true },
    ]);
    f.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['hidden'] });
  });
  function fixture() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    });
    let actor = 'actor-A';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <WorkspaceVisibilityProvider actorId={actor}>
          {children}
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
    return {
      client,
      wrapper,
      switchActor: () => {
        actor = 'actor-B';
      },
    };
  }
  it('filters Hidden team/personal choices and retains canonical cached pages', async () => {
    const { client, wrapper } = fixture();
    const { result } = renderHook(useChatVisibleWorkspaces, { wrapper });
    await waitFor(() =>
      expect(result.current.workspaces.map((ws) => ws.id)).toEqual(['visible'])
    );
    expect(
      client.getQueryData(['chat-workspaces', 'actor-A', 'infinite'])
    ).toMatchObject({
      pages: [{ workspaces: [{ id: 'visible' }, { id: 'hidden' }] }],
    });
  });
  it('fails discovery closed on unknown visibility', async () => {
    f.hidden.mockRejectedValue(new Error('offline'));
    const { wrapper, client } = fixture();
    const { result } = renderHook(useChatVisibleWorkspaces, { wrapper });
    await waitFor(() =>
      expect(
        client.getQueryState(['workspace-hidden', 'actor-A'])?.status
      ).toBe('error')
    );
    expect(f.list).not.toHaveBeenCalled();
    expect(result.current.workspaces).toEqual([]);
  });
  it('discovers later visible rows in one canonical fetch without artificial page caps', async () => {
    const hiddenIds = Array.from(
      { length: 500 },
      (_, index) => `hidden-${index}`
    );
    f.hidden.mockResolvedValue({ hiddenWorkspaceIds: hiddenIds });
    f.list.mockResolvedValue([
      ...hiddenIds.map((id) => ({ id })),
      { id: 'later-visible' },
    ]);
    const { wrapper } = fixture();
    const { result } = renderHook(useChatVisibleWorkspaces, { wrapper });
    await waitFor(() =>
      expect(result.current.workspaces.map((ws) => ws.id)).toEqual([
        'later-visible',
      ])
    );
    expect(f.list).toHaveBeenCalledTimes(1);
    expect(result.current.workspacesQuery.hasNextPage).toBe(false);
  });
  it('projects hide and restore changes without refetching the canonical list', async () => {
    const { client, wrapper } = fixture();
    const { result } = renderHook(useChatVisibleWorkspaces, { wrapper });
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
    act(() => client.setQueryData(['workspace-hidden', 'actor-A'], []));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    act(() =>
      client.setQueryData(
        ['workspace-hidden', 'actor-A'],
        ['hidden', 'visible']
      )
    );
    await waitFor(() => expect(result.current.workspaces).toHaveLength(0));
    expect(f.list).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryData(['chat-workspaces', 'actor-A', 'infinite'])
    ).toMatchObject({
      pages: [{ workspaces: [{ id: 'visible' }, { id: 'hidden' }] }],
    });
  });
  it('removes old account cache and rejects its delayed page', async () => {
    let resolve!: (value: unknown) => void;
    f.list.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const { client, wrapper, switchActor } = fixture();
    const { result, rerender } = renderHook(useChatVisibleWorkspaces, {
      wrapper,
    });
    await waitFor(() => expect(f.list).toHaveBeenCalledTimes(1));
    switchActor();
    rerender();
    await waitFor(() =>
      expect(result.current.workspaces.map((ws) => ws.id)).toEqual(['visible'])
    );
    await act(async () => resolve([{ id: 'old-actor-secret' }]));
    expect(
      client.getQueryData(['chat-workspaces', 'actor-A', 'infinite'])
    ).toBeUndefined();
    expect(result.current.workspaces.map((ws) => ws.id)).toEqual(['visible']);
  });
});
