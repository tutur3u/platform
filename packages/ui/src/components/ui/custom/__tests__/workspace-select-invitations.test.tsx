import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceInvitationRecord } from '@tuturuuu/internal-api/workspaces';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../apps/web/messages/en.json';
import { WorkspaceVisibilityProvider } from '../../../../hooks/use-workspace-visibility';
import { WorkspaceSelect } from '../workspace-select';
import { Command, CommandInput, CommandList } from '../../command';
import {
  useWorkspaceInvitations,
  WorkspaceInvitationItems,
} from '../workspace-select-invitations';

const mocks = vi.hoisted(() => ({
  acceptWorkspaceInvite: vi.fn(),
  declineWorkspaceInvite: vi.fn(),
  listWorkspaceInvitations: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/workspaces', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tuturuuu/internal-api/workspaces')>(),
  acceptWorkspaceInvite: mocks.acceptWorkspaceInvite,
  declineWorkspaceInvite: mocks.declineWorkspaceInvite,
  listWorkspaceInvitations: mocks.listWorkspaceInvitations,
}));

const invitation: WorkspaceInvitationRecord = {
  createdAt: null,
  matchedEmail: 'invitee@example.com',
  source: 'email',
  type: 'MEMBER',
  workspace: {
    avatar_url: null,
    handle: 'acme',
    id: 'workspace-1',
    logo_url: null,
    name: 'Acme',
    personal: false,
  },
};

const messages = {
  common: {
    guest_access: 'Guest',
    members: 'Member',
    retry: 'Retry',
  },
  'workspace-invitation': {
    accept: 'Accept',
    'accept-error': 'Could not accept',
    'accept-success': 'Accepted',
    'decline-error': 'Could not decline',
    'decline-success': 'Declined',
    'direct-invite': 'Direct invitation',
    'email-invite': 'Email invitation',
    'list-eyebrow': 'Pending invitations',
    reject: 'Decline',
  },
};

function Harness({
  onAccepted = vi.fn(),
  onDeclined = vi.fn(),
}: {
  onAccepted?: (value: WorkspaceInvitationRecord) => void;
  onDeclined?: () => void;
}) {
  const controller = useWorkspaceInvitations({
    cacheScope: 'user-1',
    enabled: true,
    onAccepted,
    onDeclined,
  });

  return (
    <Command>
      <CommandInput aria-label="Search" />
      <CommandList>
        <WorkspaceInvitationItems
          controller={controller}
          fallbackLogoUrl="/logo.svg"
        />
      </CommandList>
    </Command>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <Harness {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('workspace invitation picker items', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWorkspaceInvitations.mockResolvedValue({
      invitations: [invitation],
    });
    mocks.acceptWorkspaceInvite.mockResolvedValue(undefined);
    mocks.declineWorkspaceInvite.mockResolvedValue(undefined);
  });

  it('accepts the highlighted invitation and reports the accepted workspace', async () => {
    const onAccepted = vi.fn();
    renderHarness({ onAccepted });

    const option = await screen.findByRole('option', { name: /Acme/ });
    fireEvent.click(option);

    await waitFor(() =>
      expect(mocks.acceptWorkspaceInvite).toHaveBeenCalledWith('workspace-1')
    );
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(invitation));
  });

  it('declines in place without activating the accept option', async () => {
    const onDeclined = vi.fn();
    renderHarness({ onDeclined });

    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mocks.declineWorkspaceInvite).toHaveBeenCalledWith('workspace-1')
    );
    expect(mocks.acceptWorkspaceInvite).not.toHaveBeenCalled();
    await waitFor(() => expect(onDeclined).toHaveBeenCalledOnce());
  });
});


vi.mock('next/navigation', () => ({
  usePathname: () => '/en/workspace-0/tasks',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

it('keeps all 42 memberships selectable when invitations return 401', async () => {
  const workspaces = Array.from({ length: 42 }, (_, index) => ({
    id: `workspace-${index}`, name: `Orchard ${index}`, tier: 'PRO' as const,
    personal: false, avatar_url: null, logo_url: null,
  }));
  const requests: string[] = [];
  const network = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input), 'https://fixture.invalid').pathname;
    requests.push(path);
    if (path === '/api/v1/workspaces') return Response.json(workspaces);
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  const { listWorkspaces } = await import('@tuturuuu/internal-api/workspaces');
  mocks.listWorkspaceInvitations.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['workspace-hidden', 'user-1'], []);
  client.setQueryData(['workspace-user', 'user-1'], { id: 'user-1', default_workspace_id: null });
  client.setQueryData(['workspace-select-current-workspace', 'user-1', 'workspace-0'], workspaces[0]);
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en}>
        <WorkspaceVisibilityProvider actorId="user-1">
          <WorkspaceSelect wsId="workspace-0" cacheScope="user-1"
            fetchWorkspaces={() => listWorkspaces({ baseUrl: 'https://fixture.invalid', fetch: network })} />
        </WorkspaceVisibilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: /Orchard 0/ }));
  await waitFor(() => expect(document.querySelectorAll('[data-workspace-choice]')).toHaveLength(42));
  await waitFor(() => expect(client.getQueryState(['workspace-invitations', 'user-1'])?.status).toBe('error'), { timeout: 5000 });
  const input = screen.getByRole('textbox');
  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const first = document.querySelector('[data-workspace-choice]');
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first!, { key: 'End' });
  expect(document.activeElement).toBe(Array.from(document.querySelectorAll('[data-workspace-choice]')).at(-1));
  const current = document.querySelector('[data-workspace-choice][title="Orchard 0"]');
  expect(current?.closest('.overflow-y-auto')).not.toBeNull();
  const command = document.querySelector('[cmdk-root]');
  expect(command).toHaveClass('h-auto', 'shrink-0');
  expect(requests).toContain('/api/v1/workspaces');
  expect(document.querySelectorAll('[data-workspace-choice]')).toHaveLength(42);
  expect(screen.queryByRole('alert')).toBeNull();
});
