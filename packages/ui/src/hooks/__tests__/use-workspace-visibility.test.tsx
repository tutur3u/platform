import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceVisibility,
  WorkspaceVisibilityProvider,
} from '../use-workspace-visibility';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.get,
  updateCurrentUserHiddenWorkspace: mocks.put,
}));
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup(
  actor = 'A',
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actor}>
        {children}
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(() => useWorkspaceVisibility(), { wrapper }), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ hiddenWorkspaceIds: [] });
  mocks.put.mockResolvedValue({});
});
describe('private owner-scoped workspace visibility', () => {
  it('optimistically hides and rolls back only the failed workspace', async () => {
    const write = deferred<object>();
    mocks.put.mockReturnValue(write.promise);
    const hook = setup();
    await waitFor(() => expect(hook.result.current.known).toBe(true));
    let operation!: Promise<void>;
    act(() => {
      operation = hook.result.current.setHidden('ws-1', true);
    });
    await waitFor(() =>
      expect(hook.result.current.hiddenIds).toEqual(['ws-1'])
    );
    await act(async () => {
      write.reject(new Error('offline'));
      await expect(operation).rejects.toThrow('offline');
    });
    expect(hook.result.current.hiddenIds).toEqual([]);
    expect(hook.result.current.updateError).not.toBeNull();
    expect(mocks.put).toHaveBeenCalledWith('ws-1', true, 'A');
    await act(async () => {
      await hook.result.current.refetch();
    });
    expect(hook.result.current.updateError).toBeNull();
  });
  it('a stale refresh cannot replace optimistic state', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.known).toBe(true));
    const read = deferred<{ hiddenWorkspaceIds: string[] }>();
    mocks.get
      .mockImplementationOnce(() => read.promise)
      .mockResolvedValue({ hiddenWorkspaceIds: ['ws-1'] });
    act(() => {
      void hook.result.current.refetch();
    });
    await act(async () => {
      await hook.result.current.setHidden('ws-1', true);
    });
    await act(async () => {
      read.resolve({ hiddenWorkspaceIds: [] });
    });
    expect(hook.result.current.hiddenIds).toEqual(['ws-1']);
  });
  it('suppresses duplicate writes for the same pending workspace', async () => {
    const write = deferred<object>();
    mocks.put.mockReturnValue(write.promise);
    const hook = setup();
    await waitFor(() => expect(hook.result.current.known).toBe(true));
    let operation!: Promise<void>;
    act(() => {
      operation = hook.result.current.setHidden('ws-1', true);
    });
    await waitFor(() =>
      expect(hook.result.current.pending.has('ws-1')).toBe(true)
    );
    await act(async () => {
      await hook.result.current.setHidden('ws-1', true);
    });
    expect(mocks.put).toHaveBeenCalledTimes(1);
    await act(async () => {
      write.resolve({});
      await operation;
    });
  });
  it('removes private owner caches on logout and ignores late response', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.known).toBe(true));
    const write = deferred<object>();
    mocks.put.mockReturnValue(write.promise);
    let operation!: Promise<void>;
    act(() => {
      operation = hook.result.current.setHidden('ws-1', true);
    });
    await waitFor(() =>
      expect(hook.result.current.hiddenIds).toEqual(['ws-1'])
    );
    hook.unmount();
    write.resolve({});
    await operation;
    expect(hook.client.getQueryData(['workspace-hidden', 'A'])).toBeUndefined();
    expect(hook.client.getQueryData(['workspace-hidden', 'B'])).toBeUndefined();
  });
  it('two actors use independent hidden cache keys', async () => {
    mocks.get.mockImplementation(async (actor: string) => ({
      hiddenWorkspaceIds: actor === 'A' ? ['ws-1'] : [],
    }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const a = setup('A', client);
    const b = setup('B', client);
    await waitFor(() => expect(a.result.current.hiddenIds).toEqual(['ws-1']));
    await waitFor(() => expect(b.result.current.known).toBe(true));
    expect(b.result.current.hiddenIds).toEqual([]);
  });
});

it('settles a refetch safely after logout without returning private old-actor data', async () => {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.known).toBe(true));
  const read = deferred<{ hiddenWorkspaceIds: string[] }>();
  mocks.get.mockReturnValue(read.promise);
  let operation!: ReturnType<typeof hook.result.current.refetch>;
  act(() => {
    operation = hook.result.current.refetch();
  });
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  hook.unmount();
  read.resolve({ hiddenWorkspaceIds: ['old-private'] });
  await expect(operation).resolves.toBeNull();
  expect(hook.client.getQueryData(['workspace-hidden', 'A'])).toBeUndefined();
});
