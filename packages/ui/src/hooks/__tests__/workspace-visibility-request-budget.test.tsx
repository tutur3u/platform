import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useWorkspaceVisibility,
  WorkspaceVisibilityProvider,
} from '../use-workspace-visibility';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.get,
  updateCurrentUserHiddenWorkspace: mocks.put,
}));

function Observer({ name }: { name: string }) {
  const visibility = useWorkspaceVisibility();
  return (
    <p>
      {name}:{visibility.known ? 'known' : 'loading'}
    </p>
  );
}

function shell(client: QueryClient, observers: string[]) {
  return (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="A">
        {observers.map((name) => (
          <Observer key={name} name={name} />
        ))}
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
}

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ hiddenWorkspaceIds: [] });
});

it('serves remounted shell observers from one read for several minutes', async () => {
  // Only the clock is faked, so React Query's staleness check moves while
  // rendering and waitFor keep real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  const queryClient = client();
  const view = render(shell(queryClient, ['sidebar', 'launcher']));
  await waitFor(() => expect(view.getByText('sidebar:known')).toBeTruthy());
  // Sidebar hover, user menu and lazy shell swaps remount observers, spread
  // over a few minutes of normal use.
  for (const observers of [
    ['launcher'],
    ['launcher', 'sidebar-rail'],
    ['launcher', 'sidebar-panel', 'user-menu'],
    ['launcher', 'sidebar-rail'],
  ]) {
    vi.setSystemTime(Date.now() + 60_000);
    view.rerender(shell(queryClient, observers));
  }
  await waitFor(() =>
    expect(view.getByText('sidebar-rail:known')).toBeTruthy()
  );
  expect(mocks.get).toHaveBeenCalledOnce();
});

it('does not retry a rate-limited read on top of the fetch layer', async () => {
  mocks.get.mockRejectedValue(
    new InternalApiError('Too many requests', 429, undefined, 30)
  );
  const view = render(shell(client(), ['sidebar']));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(view.getByText('sidebar:loading')).toBeTruthy();
  expect(mocks.get).toHaveBeenCalledOnce();
});

it('still retries a transient server failure once', async () => {
  mocks.get
    .mockRejectedValueOnce(new InternalApiError('Unavailable', 503))
    .mockResolvedValue({ hiddenWorkspaceIds: ['ws-1'] });
  const view = render(shell(client(), ['sidebar']));
  await waitFor(() => expect(view.getByText('sidebar:known')).toBeTruthy());
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
