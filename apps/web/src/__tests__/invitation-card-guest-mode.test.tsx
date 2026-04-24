import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvitationCard from '@/app/[locale]/(dashboard)/[wsId]/invitation-card';

const testWorkspace: Workspace = {
  id: 'ws-1',
  name: 'Workspace One',
  avatar_url: null,
  logo_url: null,
  created_at: null,
  creator_id: 'user-1',
  deleted: null,
  energy_profile: null,
  first_day_of_week: null,
  handle: null,
  personal: false,
  scheduling_settings: null,
  timezone: null,
};

const refreshMock = vi.fn();
const pushMock = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('InvitationCard guest self-join mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ errorCode: 'NO_MATCHING_WORKSPACE_USER' }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders guest copy and button label', () => {
    render(<InvitationCard workspace={testWorkspace} allowGuestSelfJoin />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('invite.workspace-guest-join')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'invite.join-as-guest-button' })
    ).toBeTruthy();
  });

  it('shows guest-specific error when guest match fails', async () => {
    render(<InvitationCard workspace={testWorkspace} allowGuestSelfJoin />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'invite.join-as-guest-button' })
    );

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'invite.guest-join-error-title',
        expect.objectContaining({
          description: 'invite.guest-join-error-msg',
        })
      );
    });
  });
});
