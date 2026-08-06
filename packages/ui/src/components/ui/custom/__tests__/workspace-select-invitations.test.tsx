import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceInvitationRecord } from '@tuturuuu/internal-api/workspaces';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
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
