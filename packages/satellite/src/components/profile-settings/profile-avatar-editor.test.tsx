import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { CurrentUserProfileResponse } from '@tuturuuu/internal-api/users';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileAvatarEditor } from './profile-avatar-editor';

vi.mock('@tuturuuu/internal-api', () => ({
  removeCurrentUserAvatar: vi.fn(),
  uploadCurrentUserAvatar: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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

afterEach(cleanup);

describe('ProfileAvatarEditor', () => {
  it('keeps the profile avatar compact even when package utility classes are not emitted', () => {
    const profile: CurrentUserProfileResponse = {
      id: 'user-1',
      avatar_url: 'https://cdn.example.com/avatar.png',
      created_at: '2026-07-23T00:00:00.000Z',
      default_workspace_id: null,
      display_name: 'Sokora',
      email: 'sokora@example.com',
      full_name: null,
      new_email: null,
    };

    const { container } = renderWithClient(
      <ProfileAvatarEditor profile={profile} />
    );
    const avatar = container.querySelector<HTMLElement>('[data-slot="avatar"]');
    expect(avatar?.style.width).toBe('4rem');
    expect(avatar?.style.height).toBe('4rem');
    expect(avatar?.style.padding).toBe('0.25rem');
  });
});
