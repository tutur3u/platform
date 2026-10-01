import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ page: vi.fn(), hidden: vi.fn() }));
vi.mock('./actions', () => ({ fetchWorkspacesPage: f.page }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: f.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));

import { useChatVisibleWorkspaces } from './use-chat-visible-workspaces';

describe('Chat workspace discovery projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.page.mockResolvedValue({
      nextOffset: null,
      workspaces: [{ id: 'visible' }, { id: 'hidden', personal: true }],
    });
    f.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['hidden'] });
  });
  function fixture() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
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
    const { wrapper } = fixture();
    const { result } = renderHook(useChatVisibleWorkspaces, { wrapper });
    await waitFor(() =>
      expect(result.current.workspacesQuery.isSuccess).toBe(true)
    );
    expect(result.current.workspaces).toEqual([]);
  });
  it('removes old account cache and rejects its delayed page', async () => {
    let resolve!: (value: unknown) => void;
    f.page.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const { client, wrapper, switchActor } = fixture();
    const { result, rerender } = renderHook(useChatVisibleWorkspaces, {
      wrapper,
    });
    await waitFor(() => expect(f.page).toHaveBeenCalledTimes(1));
    switchActor();
    rerender();
    await waitFor(() =>
      expect(result.current.workspaces.map((ws) => ws.id)).toEqual(['visible'])
    );
    await act(async () =>
      resolve({ nextOffset: null, workspaces: [{ id: 'old-actor-secret' }] })
    );
    expect(
      client.getQueryData(['chat-workspaces', 'actor-A', 'infinite'])
    ).toBeUndefined();
    expect(result.current.workspaces.map((ws) => ws.id)).toEqual(['visible']);
  });
});
