import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useVisibleWorkspaces } from '../use-visible-workspaces';
import { WorkspaceVisibilityProvider } from '../use-workspace-visibility';

const mocks = vi.hoisted(() => ({ list: vi.fn(), hidden: vi.fn() }));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: mocks.list,
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([{ id: 'visible' }, { id: 'hidden' }]);
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['hidden'] });
});
function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="A">
        {children}
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}
it('retains an explicit zero bound and only exposes known visible choices', async () => {
  const { client, wrapper } = fixture();
  const { result } = renderHook(() => useVisibleWorkspaces(true, 0), {
    wrapper,
  });
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'visible' }]));
  expect(mocks.list).toHaveBeenCalledWith({ limit: 0 });
  expect(client.getQueryData(['workspace-ui-list', 'A', 0])).toHaveLength(2);
});
it('settled private discovery failure is an error rather than permanent loading', async () => {
  mocks.hidden.mockRejectedValue(new Error('offline'));
  const { client, wrapper } = fixture();
  const { result } = renderHook(() => useVisibleWorkspaces(), { wrapper });
  await waitFor(() =>
    expect(client.getQueryState(['workspace-hidden', 'A'])?.status).toBe(
      'error'
    )
  );
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isError).toBe(true);
  expect(result.current.error?.message).toBe('offline');
  expect(result.current.data).toBeUndefined();
});

it('distinguishes an absent personal workspace from one excluded by Hidden preferences', async () => {
  mocks.list.mockResolvedValue([{ id: 'team', personal: false }]);
  const { client, wrapper } = fixture();
  const { result } = renderHook(() => useVisibleWorkspaces(), { wrapper });
  await waitFor(() =>
    expect(result.current.personalWorkspaceMissing).toBe(true)
  );
  mocks.list.mockResolvedValue([
    { id: 'team', personal: false },
    { id: 'personal', personal: true },
  ]);
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['personal'] });
  await result.current.refetch();
  await waitFor(() =>
    expect(result.current.data).toEqual([{ id: 'team', personal: false }])
  );
  expect(result.current.personalWorkspaceMissing).toBe(false);
  expect(client.getQueryData(['workspace-ui-list', 'A'])).toHaveLength(2);
});
