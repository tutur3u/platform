import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NotificationCard } from './notification-card';
import { NotificationRuntime } from './notification-runtime';

const mocks = vi.hoisted(() => ({ accept: vi.fn(), metadata: vi.fn() }));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  acceptWorkspaceInvite: mocks.accept,
  declineWorkspaceInvite: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  updateNotificationMetadata: mocks.metadata,
}));

it('refreshes the recipient picker caches after notification acceptance', async () => {
  const client = new QueryClient();
  const keys = ['workspace-invitations', 'workspace-ui-list'];
  for (const prefix of keys) {
    client.setQueryData([prefix, 'user-1'], ['stale']);
    client.setQueryData([prefix, 'other-user'], ['other']);
  }
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <NotificationRuntime.Provider
      value={{
        params: {},
        pathname: '/',
        router: { push: vi.fn(), refresh: vi.fn() },
        Link: (props) => <a {...props} />,
        realtime: false,
      }}
    >
      <NotificationCard
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
        onMarkAsRead={vi.fn()}
        queryClient={client}
        markAsReadText="Read"
        markAsUnreadText="Unread"
        acceptText="Accept"
        declineText="Decline"
        acceptedText="Accepted"
        declinedText="Declined"
      />
    </NotificationRuntime.Provider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('workspace-1'));
  await waitFor(() =>
    expect(
      client.getQueryState(['workspace-invitations', 'user-1'])?.isInvalidated
    ).toBe(true)
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
