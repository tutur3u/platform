import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceUser } from '../use-workspace-user';
import {
  useWorkspaceVisibility,
  WorkspaceVisibilityProvider,
} from '../use-workspace-visibility';

const mocks = vi.hoisted(() => ({ hidden: vi.fn(), profile: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  getCurrentUserProfile: mocks.profile,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: ['private'] });
  mocks.profile.mockResolvedValue({ id: 'A' });
});
function Probe() {
  const hidden = useWorkspaceVisibility();
  const user = useWorkspaceUser();
  return (
    <output>
      {JSON.stringify({
        known: hidden.known,
        ids: hidden.hiddenIds,
        user: user.data?.id,
      })}
    </output>
  );
}
function fixture() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
}
it('retains the root owner cache across same-actor route unmount and remount', async () => {
  const client = fixture();
  function Tree({ route }: { route: boolean }) {
    return (
      <QueryClientProvider client={client}>
        <WorkspaceVisibilityProvider actorId="A">
          {route && (
            <WorkspaceVisibilityProvider actorId="A">
              <Probe />
            </WorkspaceVisibilityProvider>
          )}
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
  }
  const tree = render(<Tree route />);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('"known":true')
  );
  await waitFor(() =>
    expect(client.getQueryData(['workspace-user', 'A'])).toMatchObject({
      id: 'A',
    })
  );
  tree.rerender(<Tree route={false} />);
  expect(client.getQueryData(['workspace-hidden', 'A'])).toEqual(['private']);
  tree.rerender(<Tree route />);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('private')
  );
  expect(mocks.hidden).toHaveBeenCalledTimes(1);
  expect(mocks.profile).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['workspace-user'])).toBeUndefined();
  tree.unmount();
  expect(client.getQueryData(['workspace-hidden', 'A'])).toBeUndefined();
  expect(client.getQueryData(['workspace-user', 'A'])).toBeUndefined();
});
it('does not read profiles or private preferences without verified identity', async () => {
  const client = fixture();
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );
  await act(async () => {});
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.hidden).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('"known":false');
});
it('fails a mismatched route actor closed under a verified root', async () => {
  const client = fixture();
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="B">
        <WorkspaceVisibilityProvider actorId="A">
          <Probe />
        </WorkspaceVisibilityProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  await act(async () => {});
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.hidden).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('"known":false');
});
