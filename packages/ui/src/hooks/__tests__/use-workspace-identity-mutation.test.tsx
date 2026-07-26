import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  patchWorkspaceCacheValue,
  useUpdateWorkspaceIdentity,
} from '../use-workspace-identity-mutation';

const WS_ID = 'ws-1';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  updateWorkspace: (...args: unknown[]) => mocks.updateWorkspace(...args),
}));

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // The surfaces that show a workspace name, as each one caches it.
  queryClient.setQueryData(
    ['workspaces'],
    [
      { id: WS_ID, name: 'Old name' },
      { id: 'ws-2', name: 'Other workspace' },
    ]
  );
  queryClient.setQueryData(['workspace', WS_ID], {
    workspace: { handle: 'old-handle', id: WS_ID, name: 'Old name' },
  });
  queryClient.setQueryData(['workspace-select-current-workspace', WS_ID], {
    id: WS_ID,
    name: 'Old name',
  });
  queryClient.setQueryData(['unrelated'], { id: WS_ID, name: 'Old name' });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}

describe('patchWorkspaceCacheValue', () => {
  it('patches the record, arrays of records, and wrapped shapes', () => {
    const patch = { name: 'New name' };

    expect(
      patchWorkspaceCacheValue({ id: WS_ID, name: 'Old' }, WS_ID, patch)
    ).toEqual({ id: WS_ID, name: 'New name' });

    expect(
      patchWorkspaceCacheValue([{ id: WS_ID, name: 'Old' }], WS_ID, patch)
    ).toEqual([{ id: WS_ID, name: 'New name' }]);

    expect(
      patchWorkspaceCacheValue(
        { workspace: { id: WS_ID, name: 'Old' } },
        WS_ID,
        patch
      )
    ).toEqual({ workspace: { id: WS_ID, name: 'New name' } });
  });

  it('leaves other workspaces and unknown shapes alone', () => {
    const other = { id: 'ws-2', name: 'Other' };
    expect(patchWorkspaceCacheValue(other, WS_ID, { name: 'New' })).toBe(other);
    expect(patchWorkspaceCacheValue(null, WS_ID, { name: 'New' })).toBeNull();
    expect(patchWorkspaceCacheValue('text', WS_ID, { name: 'New' })).toBe(
      'text'
    );
  });
});

describe('useUpdateWorkspaceIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspace.mockResolvedValue({ id: WS_ID });
  });

  // Regression: renaming a workspace used to only call `router.refresh()`, which
  // re-renders server markup but leaves client caches untouched — so the
  // workspace selector kept the old name until the user reloaded the page.
  it('renames the workspace everywhere it is cached', async () => {
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => useUpdateWorkspaceIdentity({ workspaceId: WS_ID }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'New name' });
    });

    expect(queryClient.getQueryData(['workspaces'])).toEqual([
      { id: WS_ID, name: 'New name' },
      { id: 'ws-2', name: 'Other workspace' },
    ]);
    expect(queryClient.getQueryData(['workspace', WS_ID])).toEqual({
      workspace: { handle: 'old-handle', id: WS_ID, name: 'New name' },
    });
    expect(
      queryClient.getQueryData(['workspace-select-current-workspace', WS_ID])
    ).toEqual({ id: WS_ID, name: 'New name' });
  });

  it('refreshes server-rendered surfaces too', async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => useUpdateWorkspaceIdentity({ workspaceId: WS_ID }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'New name' });
    });

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('updates the cache before the request resolves', async () => {
    const { queryClient, wrapper } = createHarness();
    let resolveUpdate: (value: unknown) => void = () => {};
    mocks.updateWorkspace.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    const { result } = renderHook(
      () => useUpdateWorkspaceIdentity({ workspaceId: WS_ID }),
      { wrapper }
    );

    await act(async () => {
      void result.current.mutateAsync({ name: 'Optimistic name' });
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(['workspaces'])).toEqual([
      { id: WS_ID, name: 'Optimistic name' },
      { id: 'ws-2', name: 'Other workspace' },
    ]);

    await act(async () => {
      resolveUpdate({ id: WS_ID });
    });
  });

  it('rolls the caches back when the rename fails', async () => {
    const { queryClient, wrapper } = createHarness();
    const onError = vi.fn();
    mocks.updateWorkspace.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(
      () => useUpdateWorkspaceIdentity({ onError, workspaceId: WS_ID }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: 'New name' }).catch(() => {});
    });

    expect(queryClient.getQueryData(['workspaces'])).toEqual([
      { id: WS_ID, name: 'Old name' },
      { id: 'ws-2', name: 'Other workspace' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
