import { useQueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { afterEach, expect, it, vi } from 'vitest';
import { ClientProviders } from './client-providers';

const mocks = vi.hoisted(() => ({ hidden: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/ui/custom/account-assurance-refresh', () => ({
  AccountAssuranceRefresh: () => null,
}));
vi.mock('../components/command-launcher', () => ({
  GlobalCommandLauncher: Probe,
}));
function Probe() {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  const client = useQueryClient();
  return (
    <output
      data-cache-a={JSON.stringify(
        client.getQueryData(['workspace-hidden', 'A'])
      )}
    >
      {JSON.stringify({
        actor: actor?.actorId,
        known: visibility.known,
        ids: visibility.hiddenIds,
      })}
    </output>
  );
}
afterEach(cleanup);
it('provides the global launcher with verified identity and replaces the private account cache', async () => {
  mocks.hidden.mockImplementation(async (actor: string) => ({
    hiddenWorkspaceIds: actor === 'A' ? ['private-A'] : ['private-B'],
  }));
  const tree = render(
    <ClientProviders actorId="A" currentApp="tasks">
      <div>Route</div>
    </ClientProviders>
  );
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('private-A')
  );
  tree.rerender(
    <ClientProviders actorId="B" currentApp="tasks">
      <div>Route</div>
    </ClientProviders>
  );
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('private-B')
  );
  expect(screen.getByRole('status').textContent).not.toContain('private-A');
  expect(screen.getByRole('status').getAttribute('data-cache-a')).toBeNull();
  tree.rerender(
    <ClientProviders currentApp="tasks">
      <div>Signed out</div>
    </ClientProviders>
  );
  expect(screen.getByRole('status').textContent).toContain('"known":false');
});
