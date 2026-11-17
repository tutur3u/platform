import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationInviteActions } from './notification-card-actions';
import { DEFAULT_NOTIFICATION_LABELS } from './notification-labels';
import { NotificationRuntime } from './notification-runtime';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  metadata: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  acceptWorkspaceInvite: mocks.accept,
  declineWorkspaceInvite: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  updateNotificationMetadata: mocks.metadata,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: mocks.toast }));

afterEach(() => vi.clearAllMocks());

function renderInvite(client: QueryClient, onResolved = vi.fn()) {
  const router = { push: vi.fn(), refresh: vi.fn() };
  render(
    <QueryClientProvider client={client}>
      <NotificationRuntime.Provider
        value={{
          params: {},
          pathname: '/',
          router,
          Link: (props) => <a {...props} />,
          realtime: false,
        }}
      >
        <NotificationInviteActions
          notification={{
            id: 'notification-1',
            user_id: 'user-1',
            type: 'workspace_invite',
            title: 'Invite',
            ws_id: null,
            description: null,
            entity_type: null,
            entity_id: null,
            created_by: null,
            actor: null,
            data: { workspace_id: 'workspace-1' },
            created_at: new Date().toISOString(),
            read_at: null,
          }}
          labels={DEFAULT_NOTIFICATION_LABELS}
          onResolved={onResolved}
        />
      </NotificationRuntime.Provider>
    </QueryClientProvider>
  );
  return { router, onResolved };
}

it('refreshes the recipient picker caches after notification acceptance', async () => {
  const client = new QueryClient();
  const keys = ['workspace-invitations', 'workspace-ui-list'];
  for (const prefix of keys) {
    client.setQueryData([prefix, 'user-1'], ['stale']);
    client.setQueryData([prefix, 'other-user'], ['other']);
  }
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { onResolved, router } = renderInvite(client);
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('workspace-1'));
  await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
  expect(router.refresh).toHaveBeenCalled();
  expect(mocks.metadata).toHaveBeenCalledWith(
    'notification-1',
    expect.objectContaining({ action_taken: 'accepted' })
  );
  for (const prefix of keys) {
    expect(client.getQueryState([prefix, 'user-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState([prefix, 'other-user'])?.isInvalidated).toBe(
      false
    );
  }
  for (const prefix of [
    'workspaces',
    'user-workspaces',
    'workspace-user',
    'current-user',
    'user',
    'notifications',
  ]) {
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [prefix] })
    );
  }
});

it('reports a failed acceptance without resolving the invite', async () => {
  mocks.accept.mockRejectedValueOnce(new Error('forbidden'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { onResolved } = renderInvite(new QueryClient());
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() =>
    expect(mocks.toast.error).toHaveBeenCalledWith(
      DEFAULT_NOTIFICATION_LABELS.actionError
    )
  );
  expect(onResolved).not.toHaveBeenCalled();
  expect(mocks.toast.success).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
});
