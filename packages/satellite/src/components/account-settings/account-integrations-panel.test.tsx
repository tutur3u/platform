import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountIntegrationsNavItem } from './account-integrations-navigation';
import { AccountIntegrationsPanel } from './account-integrations-panel';

const api = vi.hoisted(() => ({
  disconnectUpskiiLink: vi.fn(),
  getUpskiiLinkStatus: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/integrations', () => api);
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

const LINK = {
  linkedAt: '2026-11-24T00:00:00.000Z',
  linkId: '00000000-0000-4000-9000-000000000001',
  scopes: ['upskii:classes:read'],
  upskiiEmail: 'learner@upskii.test',
};

function renderPanel(centralUrl?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AccountIntegrationsPanel centralUrl={centralUrl} />, {
    wrapper,
  });
}

function upskiiRow() {
  return screen
    .getByText('upskii')
    .closest('[data-slot="settings-row"]') as HTMLElement;
}

beforeEach(() => {
  api.getUpskiiLinkStatus.mockResolvedValue({ canLink: true, link: null });
  api.disconnectUpskiiLink.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('account integrations panel', () => {
  it('lists Upskii first, then the Calendar and Mail connectors', () => {
    renderPanel('https://tuturuuu.com');
    const titles = Array.from(
      document.querySelectorAll('[data-slot="settings-row-title"]')
    ).map((title) => title.textContent);
    expect(titles).toEqual(['upskii', 'calendar', 'mail']);
  });

  it('serves the official Upskii mark from the web origin', () => {
    const { container } = renderPanel('https://tuturuuu.com/vi/personal?x=1');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://tuturuuu.com/media/integrations/upskii.png'
    );
  });

  it('hands the connect step to Upskii settings', async () => {
    renderPanel();
    const connect = await within(upskiiRow()).findByRole('link', {
      name: /connect/,
    });
    expect(connect.getAttribute('href')).toBe(
      'https://app.upskii.com/settings?connect=tuturuuu'
    );
  });

  it('shows coming soon when the server refuses linking', async () => {
    api.getUpskiiLinkStatus.mockResolvedValue({ canLink: false, link: null });
    renderPanel();
    expect(await within(upskiiRow()).findByText('coming_soon')).toBeDefined();
    expect(within(upskiiRow()).queryByRole('link')).toBeNull();
  });

  it('offers a retry when the status cannot load', async () => {
    api.getUpskiiLinkStatus.mockRejectedValue(new Error('offline'));
    renderPanel();
    expect(
      await within(upskiiRow()).findByRole('button', { name: 'retry' })
    ).toBeDefined();
  });

  it('shows the linked account and disconnects after confirmation', async () => {
    api.getUpskiiLinkStatus.mockResolvedValue({ canLink: true, link: LINK });
    renderPanel();
    expect(
      await screen.findByText('upskii_linked_as:learner@upskii.test')
    ).toBeDefined();
    fireEvent.click(
      within(upskiiRow()).getByRole('button', { name: /disconnect/ })
    );
    expect(api.disconnectUpskiiLink).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'disconnect',
      })
    );
    await waitFor(() => expect(api.disconnectUpskiiLink).toHaveBeenCalled());
  });

  it('hands Calendar and Mail off to their existing settings panels', () => {
    renderPanel();
    const calendar = new URL(
      screen
        .getByRole('link', { name: 'manage_label:calendar' })
        .getAttribute('href') ?? ''
    );
    expect(calendar.pathname).toBe('/vi/personal');
    expect(calendar.searchParams.get('settingsTab')).toBe(
      'calendar_integrations'
    );
    const mailLink = screen.getByRole('link', { name: 'manage_label:mail' });
    const mail = new URL(mailLink.getAttribute('href') ?? '');
    expect(mail.pathname).toBe('/vi/personal/inbox');
    expect(mail.searchParams.get('mailSettings')).toBe('open');
    expect(mailLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('links to the full catalog', () => {
    renderPanel('https://tuturuuu.com');
    expect(
      screen.getByRole('link', { name: /browse_all/ }).getAttribute('href')
    ).toBe('https://tuturuuu.com/integrations');
  });

  it('makes the tab findable by service name in settings search', () => {
    const item = createAccountIntegrationsNavItem((key) => key);
    expect(item.name).toBe('account_integrations');
    expect(item.keywords).toEqual(
      expect.arrayContaining(['Upskii', 'Calendar', 'Mail', 'Gmail', 'Outlook'])
    );
  });
});
