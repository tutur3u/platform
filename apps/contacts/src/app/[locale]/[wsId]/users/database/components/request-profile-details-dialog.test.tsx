import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestProfileDetailsDialog } from './request-profile-details-dialog';

const mocks = vi.hoisted(() => ({
  createWorkspaceUserProfileLink: vi.fn(),
  getWorkspaceUserProfileLinkDefaultConfigs: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  createWorkspaceUserProfileLink: (
    ...args: Parameters<typeof mocks.createWorkspaceUserProfileLink>
  ) => mocks.createWorkspaceUserProfileLink(...args),
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getWorkspaceUserProfileLinkDefaultConfigs: (
    ...args: Parameters<typeof mocks.getWorkspaceUserProfileLinkDefaultConfigs>
  ) => mocks.getWorkspaceUserProfileLinkDefaultConfigs(...args),
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION_CONFIG_ID:
    'WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION',
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS_CONFIG_ID:
    'WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS',
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES_CONFIG_ID:
    'WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES',
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES_CONFIG_ID:
    'WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES',
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH_CONFIG_ID:
    'WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH',
}));

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe('RequestProfileDetailsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceUserProfileLinkDefaultConfigs.mockResolvedValue({
      WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION: 'never',
      WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS: 'email,phone,email,unknown',
      WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES: 'unlimited',
      WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES: 'false',
      WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH: 'false',
    });
  });

  it('is scroll-safe and initializes from workspace defaults', async () => {
    renderWithQueryClient(
      <RequestProfileDetailsDialog
        wsId="workspace-1"
        mode="per_user"
        targetUserId="11111111-1111-4111-8111-111111111111"
        targetUserLabel="Ada Lovelace"
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('max-h-[85vh]', 'overflow-y-auto');

    await waitFor(() => {
      expect(
        screen.getByRole('switch', {
          name: 'ws-user-profile-links.create_require_auth',
        })
      ).toHaveAttribute('data-state', 'unchecked');
    });

    expect(
      screen.getByRole('switch', {
        name: 'ws-user-profile-links.create_prefill_existing_values',
      })
    ).toHaveAttribute('data-state', 'unchecked');
    expect(
      screen.getByRole('checkbox', {
        name: 'ws-user-profile-links.field_email',
      })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'ws-user-profile-links.field_phone',
      })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'ws-user-profile-links.field_display_name',
      })
    ).not.toBeChecked();
    expect(
      (
        screen.getByLabelText(
          'ws-user-profile-links.create_expires_at'
        ) as HTMLInputElement
      ).value
    ).toBe('');
    expect(
      (
        screen.getByLabelText(
          'ws-user-profile-links.create_max_uses'
        ) as HTMLInputElement
      ).value
    ).toBe('');
  });
});
