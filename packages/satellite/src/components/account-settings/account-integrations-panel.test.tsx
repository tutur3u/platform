import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountIntegrationsNavItem } from './account-integrations-navigation';
import { AccountIntegrationsPanel } from './account-integrations-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

afterEach(cleanup);

function rows() {
  return Array.from(
    document.querySelectorAll('[data-slot="settings-row-title"]')
  ).map((title) => title.textContent);
}

describe('account integrations panel', () => {
  it('lists Upskii first, then the Calendar and Mail connectors', () => {
    render(
      <AccountIntegrationsPanel centralUrl="https://tuturuuu.com" isStaff />
    );
    expect(rows()).toEqual(['upskii', 'calendar', 'mail']);
  });

  it('serves the official Upskii mark from the web origin', () => {
    const { container } = render(
      <AccountIntegrationsPanel
        centralUrl="https://tuturuuu.com/vi/personal?x=1"
        isStaff
      />
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://tuturuuu.com/media/integrations/upskii.png'
    );
  });

  it('shows early access to staff and coming soon to everyone else', () => {
    const { rerender } = render(<AccountIntegrationsPanel isStaff />);
    expect(screen.getByText('early_access')).toBeDefined();
    rerender(<AccountIntegrationsPanel isStaff={false} />);
    expect(screen.getByText('coming_soon')).toBeDefined();
    expect(screen.queryByText('early_access')).toBeNull();
  });

  it('hands Calendar and Mail off to their existing settings panels', () => {
    render(<AccountIntegrationsPanel isStaff={false} />);
    const calendar = new URL(
      screen
        .getByRole('link', { name: 'manage_label:calendar' })
        .getAttribute('href') ?? ''
    );
    expect(calendar.pathname).toBe('/vi/personal');
    expect(calendar.searchParams.get('settingsDialog')).toBe('open');
    expect(calendar.searchParams.get('settingsTab')).toBe(
      'calendar_integrations'
    );

    const mailLink = screen.getByRole('link', { name: 'manage_label:mail' });
    const mail = new URL(mailLink.getAttribute('href') ?? '');
    expect(mail.pathname).toBe('/vi/personal/inbox');
    expect(mail.searchParams.get('mailSettings')).toBe('open');
    expect(mailLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('links to the full catalog without offering an Upskii action yet', () => {
    render(
      <AccountIntegrationsPanel centralUrl="https://tuturuuu.com" isStaff />
    );
    expect(
      screen.getByRole('link', { name: /browse_all/ }).getAttribute('href')
    ).toBe('https://tuturuuu.com/integrations');
    const upskiiRow = screen
      .getByText('upskii')
      .closest('[data-slot="settings-row"]') as HTMLElement;
    expect(within(upskiiRow).queryByRole('link')).toBeNull();
  });

  it('makes the tab findable by service name in settings search', () => {
    const item = createAccountIntegrationsNavItem((key) => key);
    expect(item.name).toBe('account_integrations');
    expect(item.keywords).toEqual(
      expect.arrayContaining(['Upskii', 'Calendar', 'Mail', 'Gmail', 'Outlook'])
    );
  });
});
