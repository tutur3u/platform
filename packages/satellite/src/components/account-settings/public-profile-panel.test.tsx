import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileSettingsPanel } from './public-profile-panel';

const dialogState = vi.hoisted(() => ({
  open: true,
  tab: 'public_profile' as string | null,
}));
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: mocks.getProfile,
}));
vi.mock('@tuturuuu/ui/hooks/use-settings-dialog-url-state', () => ({
  useSettingsDialogUrlState: () => ({
    open: dialogState.open,
    openSettings: mocks.openSettings,
    tab: dialogState.tab,
  }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `public_profile.${key}`,
}));

const PROFILE = {
  avatar_url: 'https://cdn.example/avatar.png',
  banner_url: 'http://insecure.example/banner.png',
  bio: 'Public biography',
  created_at: '2026-01-01T00:00:00.000Z',
  default_workspace_id: null,
  display_name: 'Public Creator',
  email: 'private@example.com',
  full_name: 'Private Name',
  handle: 'Creator',
  id: 'private-id',
  new_email: null,
};

function renderPanel(centralUrl?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<PublicProfileSettingsPanel centralUrl={centralUrl} />, {
    wrapper,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dialogState.open = true;
  dialogState.tab = 'public_profile';
});
afterEach(cleanup);

describe('PublicProfileSettingsPanel', () => {
  it('renders only the public projection without touching the page address', async () => {
    mocks.getProfile.mockResolvedValue(PROFILE);
    window.history.replaceState(null, '', '/ws-1/home');
    const { container, unmount } = renderPanel('https://tuturuuu.example');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Public Creator' })
    ).toBeTruthy();
    expect(screen.getByText('Public biography')).toBeTruthy();
    const html = container.innerHTML;
    expect(html).toContain('https://cdn.example/avatar.png');
    for (const hidden of [
      'insecure.example',
      'private@example.com',
      'Private Name',
      'private-id',
    ])
      expect(html).not.toContain(hidden);
    expect(window.location.pathname).toBe('/ws-1/home');
    unmount();
    expect(window.location.pathname).toBe('/ws-1/home');
  });

  it('switches to the Profile tab to edit', async () => {
    mocks.getProfile.mockResolvedValue(PROFILE);
    renderPanel('https://tuturuuu.example');
    fireEvent.click(
      await screen.findByRole('button', { name: 'public_profile.edit_profile' })
    );
    expect(mocks.openSettings).toHaveBeenCalledWith('profile');
  });

  it('asks for a username instead of inventing a profile link', async () => {
    mocks.getProfile.mockResolvedValue({ ...PROFILE, handle: null });
    renderPanel('https://tuturuuu.example');
    expect(await screen.findByText('public_profile.no_username')).toBeTruthy();
  });
});
