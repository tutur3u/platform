import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useSettingsDialogUrlState } from '@tuturuuu/ui/hooks/use-settings-dialog-url-state';
import {
  type OnUrlUpdateFunction,
  withNuqsTestingAdapter,
} from 'nuqs/adapters/testing';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfileSettingsPanel } from './public-profile-panel';

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserProfile: mocks.getProfile,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const Icon = () => <span />;
const navItems = [
  {
    label: 'Account',
    items: [
      {
        description: 'Public profile',
        icon: Icon,
        label: 'Public profile tab',
        name: 'public_profile',
      },
      {
        description: 'Security',
        icon: Icon,
        label: 'Security tab',
        name: 'security',
      },
    ],
  },
];

/** Mirrors the web settings host: URL state -> dialog -> shell -> panel. */
function Host() {
  const { closeSettings, open, openSettings, tab } =
    useSettingsDialogUrlState();
  const [activeTab, setActiveTab] = useState(tab ?? 'public_profile');
  useEffect(() => {
    if (tab) setActiveTab(tab);
  }, [tab]);
  return (
    <>
      <button type="button" onClick={() => openSettings('public_profile')}>
        open settings
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeSettings();
        }}
      >
        {open && (
          <SettingsDialogShell
            activeTab={activeTab}
            navItems={navItems}
            onActiveTabChange={setActiveTab}
            showOnboardingGuide={false}
          >
            {activeTab === 'public_profile' ? (
              <PublicProfileSettingsPanel />
            ) : (
              <div data-testid="security-panel" />
            )}
          </SettingsDialogShell>
        )}
      </Dialog>
    </>
  );
}

function renderHost(onUrlUpdate: OnUrlUpdateFunction) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = withNuqsTestingAdapter({ onUrlUpdate, searchParams: '' });
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
    { wrapper: Wrapper }
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/ws-1/home');
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  }));
  mocks.getProfile.mockResolvedValue({
    avatar_url: null,
    banner_url: null,
    bio: null,
    display_name: 'Public Creator',
    handle: 'creator',
  });
});
afterEach(cleanup);

describe('Public profile tab in the settings dialog', () => {
  it('never moves the page to /u/<username>, switches tabs and closes', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderHost(onUrlUpdate);

    fireEvent.click(screen.getByRole('button', { name: 'open settings' }));
    await screen.findByRole('heading', { level: 2, name: 'Public Creator' });
    expect(window.location.pathname).toBe('/ws-1/home');
    const lastUpdate = () => onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(lastUpdate()?.searchParams.get('settingsTab')).toBe(
      'public_profile'
    );

    // Switching to another tab sticks and the address stays put.
    fireEvent.click(screen.getByRole('button', { name: /Security tab/ }));
    await screen.findByTestId('security-panel');
    await waitFor(() =>
      expect(lastUpdate()?.searchParams.get('settingsTab')).toBe('security')
    );
    expect(
      screen.queryByRole('heading', { name: 'Public Creator' })
    ).toBeNull();
    expect(window.location.pathname).toBe('/ws-1/home');

    // Back to the profile tab and then close with Escape.
    fireEvent.click(screen.getByRole('button', { name: /Public profile tab/ }));
    await screen.findByRole('heading', { level: 2, name: 'Public Creator' });
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lastUpdate()?.searchParams.has('settingsTab')).toBe(false);
    expect(lastUpdate()?.searchParams.has('settingsDialog')).toBe(false);
    expect(window.location.pathname).toBe('/ws-1/home');
  });
});
