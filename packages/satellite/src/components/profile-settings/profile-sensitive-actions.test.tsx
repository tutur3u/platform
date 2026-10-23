import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SatelliteProfileSettingsPanel } from './profile-settings-panel';

const api = vi.hoisted(() => ({
  getCurrentUserProfile: vi.fn(),
  removeCurrentUserAvatar: vi.fn(),
  updateCurrentUserEmail: vi.fn(),
  updateCurrentUserFullName: vi.fn(),
  updateCurrentUserProfile: vi.fn(),
  uploadCurrentUserAvatar: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => api);
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@tuturuuu/ui/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), isCopied: false }),
}));

const profile = {
  avatar_url: 'https://cdn.example.com/avatar.png',
  created_at: '2026-01-01T00:00:00.000Z',
  default_workspace_id: null,
  display_name: 'Ada',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  id: 'user-1',
  new_email: null,
};
const fetchSpy = vi.fn();

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SatelliteProfileSettingsPanel
        centralUrl="https://tuturuuu.com/some/path?x=1"
        user={profile as unknown as WorkspaceUser}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getCurrentUserProfile.mockResolvedValue(profile);
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('satellite profile sensitive actions', () => {
  it('links email changes out to the web profile tab instead of editing them', async () => {
    renderPanel();
    await waitFor(() => expect(api.getCurrentUserProfile).toHaveBeenCalled());

    const email = screen.getByLabelText('email-address') as HTMLInputElement;
    expect(email.value).toBe('ada@example.com');
    expect(email.readOnly).toBe(true);
    expect(email.closest('form')).toBeNull();

    const link = screen.getByRole('link', { name: /open_in_tuturuuu/ });
    expect(link.getAttribute('href')).toBe(
      'https://tuturuuu.com/personal?settingsDialog=open&settingsTab=profile'
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    // Editing and submitting the remaining profile forms never touches email.
    fireEvent.change(email, { target: { value: 'eve@example.com' } });
    for (const form of document.querySelectorAll('form')) {
      fireEvent.submit(form);
    }
    expect(api.updateCurrentUserEmail).not.toHaveBeenCalled();
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        String(url).includes('/users/me/email')
      )
    ).toBe(false);
  });

  it('does not offer avatar removal in satellites', async () => {
    renderPanel();
    await waitFor(() => expect(api.getCurrentUserProfile).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /new_avatar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /remove_avatar/ })).toBeNull();
    expect(api.removeCurrentUserAvatar).not.toHaveBeenCalled();
  });
});
