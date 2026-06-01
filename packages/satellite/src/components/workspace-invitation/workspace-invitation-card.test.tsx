import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SatelliteWorkspaceInvitationCard,
  SatelliteWorkspaceInvitationList,
} from './workspace-invitation-card';

const acceptWorkspaceInvite = vi.fn();
const declineWorkspaceInvite = vi.fn();
const routerPush = vi.fn();
const routerRefresh = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  acceptWorkspaceInvite: (...args: unknown[]) => acceptWorkspaceInvite(...args),
  declineWorkspaceInvite: (...args: unknown[]) =>
    declineWorkspaceInvite(...args),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    const messages: Record<string, string> = {
      accept: 'Accept invitation',
      'accept-error': 'Failed to accept invitation',
      'accept-success': 'Workspace invitation accepted',
      accepting: 'Accepting...',
      description: 'Accept this invitation to join the workspace.',
      'direct-invite': 'Direct invitation',
      'email-invite': 'Email invitation',
      reject: 'Reject',
      'decline-error': 'Failed to reject invitation',
      'decline-success': 'Workspace invitation rejected',
      rejecting: 'Rejecting...',
      'list-eyebrow': 'Pending invitations',
      'list-title': 'Choose a workspace invitation',
      title: `Join ${params?.workspace ?? ''}`,
    };

    return messages[key] ?? key;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
}));

const invitation = {
  createdAt: '2026-06-01T00:00:00.000Z',
  matchedEmail: null,
  source: 'direct' as const,
  type: 'MEMBER' as const,
  workspace: {
    avatar_url: null,
    handle: 'alpha',
    id: 'workspace-alpha',
    logo_url: null,
    name: 'Alpha Workspace',
    personal: false,
  },
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SatelliteWorkspaceInvitationCard', () => {
  it('accepts an invitation and navigates to the workspace', async () => {
    acceptWorkspaceInvite.mockResolvedValue({ message: 'success' });

    renderWithClient(
      <SatelliteWorkspaceInvitationCard invitation={invitation} />
    );

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    await waitFor(() =>
      expect(acceptWorkspaceInvite).toHaveBeenCalledWith('workspace-alpha')
    );
    expect(toastSuccess).toHaveBeenCalledWith('Workspace invitation accepted');
    expect(routerPush).toHaveBeenCalledWith('/workspace-alpha');
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('rejects an invitation and falls back to the existing empty state', async () => {
    declineWorkspaceInvite.mockResolvedValue({ message: 'success' });

    renderWithClient(
      <SatelliteWorkspaceInvitationCard
        afterDeclineHref="/dashboard"
        invitation={invitation}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() =>
      expect(declineWorkspaceInvite).toHaveBeenCalledWith('workspace-alpha')
    );
    expect(toastSuccess).toHaveBeenCalledWith('Workspace invitation rejected');
    expect(routerPush).toHaveBeenCalledWith('/dashboard');
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('shows the pending accept state while the mutation is running', async () => {
    acceptWorkspaceInvite.mockReturnValue(new Promise(() => undefined));

    renderWithClient(
      <SatelliteWorkspaceInvitationCard invitation={invitation} />
    );

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(await screen.findByText('Accepting...')).toBeTruthy();
  });
});

describe('SatelliteWorkspaceInvitationList', () => {
  it('removes a rejected invitation from the list without hiding the others', async () => {
    declineWorkspaceInvite.mockResolvedValue({ message: 'success' });
    const secondInvitation = {
      ...invitation,
      workspace: {
        ...invitation.workspace,
        id: 'workspace-beta',
        name: 'Beta Workspace',
      },
    };

    renderWithClient(
      <SatelliteWorkspaceInvitationList
        invitations={[invitation, secondInvitation]}
      />
    );

    expect(screen.getByText('Join Alpha Workspace')).toBeTruthy();
    expect(screen.getByText('Join Beta Workspace')).toBeTruthy();

    const rejectButtons = screen.getAllByRole('button', { name: /reject/i });
    fireEvent.click(rejectButtons[0] as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByText('Join Alpha Workspace')).toBeNull()
    );
    expect(screen.getByText('Join Beta Workspace')).toBeTruthy();
  });
});
