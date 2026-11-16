import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SatelliteProfileSettingsPanel } from './profile-settings-panel';

const getCurrentUserProfile = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: (...args: unknown[]) => getCurrentUserProfile(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({
    copyToClipboard: vi.fn(),
    isCopied: false,
  }),
}));

vi.mock('./profile-avatar-editor', () => ({
  ProfileAvatarEditor: ({
    profile,
  }: {
    profile: { avatar_url: string | null };
  }) => <div data-avatar-url={profile.avatar_url ?? ''} data-testid="avatar" />,
  satelliteProfileQueryKey: ['current-user-profile'],
}));

vi.mock('./profile-field-form', () => ({
  ProfileFieldForm: ({
    field,
    initialValue,
    placeholder,
  }: {
    field: string;
    initialValue: string | null;
    placeholder?: string | null;
  }) => (
    <input
      aria-label={field}
      placeholder={placeholder ?? ''}
      readOnly
      value={initialValue ?? ''}
    />
  ),
}));

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
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

describe('SatelliteProfileSettingsPanel', () => {
  it('hydrates database profile fields immediately from a lightweight session user', async () => {
    getCurrentUserProfile.mockResolvedValue({
      id: 'user-1',
      avatar_url: 'https://cdn.example.com/avatar.png',
      created_at: '2026-07-23T00:00:00.000Z',
      default_workspace_id: null,
      display_name: 'Sokora',
      email: 'sokora@example.com',
      full_name: null,
      new_email: null,
    });

    const sessionUser = {
      id: 'user-1',
      avatar_url: null,
      created_at: '2026-07-23T00:00:00.000Z',
      display_name: null,
      email: 'sokora@example.com',
      full_name: null,
      new_email: null,
    } as unknown as WorkspaceUser;

    renderWithClient(
      <SatelliteProfileSettingsPanel
        centralUrl="https://tuturuuu.com"
        user={sessionUser}
      />
    );

    await waitFor(() => expect(getCurrentUserProfile).toHaveBeenCalledOnce());
    await waitFor(() => {
      const displayName = screen.getByLabelText(
        'display_name'
      ) as HTMLInputElement;
      expect(displayName.value).toBe('Sokora');
    });
    const fullName = screen.getByLabelText('full_name') as HTMLInputElement;
    expect(fullName.placeholder).toBe('Sokora');
    expect(screen.getByTestId('avatar').dataset.avatarUrl).toBe(
      'https://cdn.example.com/avatar.png'
    );
  });

  it('renders status badges from shared variants and a plain read-only user id', async () => {
    getCurrentUserProfile.mockResolvedValue({
      id: 'user-1',
      avatar_url: null,
      created_at: '2026-07-23T00:00:00.000Z',
      default_workspace_id: null,
      display_name: 'Sokora',
      email: 'sokora@example.com',
      full_name: null,
      new_email: null,
    });

    renderWithClient(
      <SatelliteProfileSettingsPanel
        centralUrl="https://tuturuuu.com"
        user={{ id: 'user-1' } as unknown as WorkspaceUser}
      />
    );

    const active = await screen.findByText('active');
    const verified = screen.getByText('verified');
    // Success variant owns the green tokens; no one-off overrides on top.
    expect(active.className).toContain('bg-dynamic-green/10');
    expect(active.className).not.toContain('border-dynamic-green/30');
    // Outline variant: no fill, so it reads on any settings card.
    expect(verified.className).not.toMatch(/(^|\s)bg-/);

    const userId = screen.getByDisplayValue('user-1') as HTMLInputElement;
    expect(userId.disabled).toBe(true);
    // The settings surface styles it; the field carries no shade of its own.
    expect(userId.className).not.toMatch(
      /(^|\s)(disabled:)?bg-(muted|secondary|accent)/
    );
  });
});
