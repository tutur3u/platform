// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_EVENT_GROUPS,
  isComingSoonPreference,
} from '@/constants/notification-event-groups';
import NotificationPreferencesTable from './notification-preferences-table';

const mocks = vi.hoisted(() => ({
  /** The rows are cached so the component sees a stable query result. */
  cache: { data: undefined as unknown[] | undefined, key: '' },
  /** `event-channel` pairs the fetched rows leave out or switch off. */
  missing: new Set<string>(),
  off: new Set<string>(),
  updateAccount: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({ data: undefined, isLoading: false }),
  useUpdateNotificationPreferences: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useAccountNotificationPreferences', () => ({
  useAccountNotificationPreferences: () => {
    const key = `${[...mocks.off]}|${[...mocks.missing]}`;
    if (mocks.cache.key !== key || !mocks.cache.data) {
      mocks.cache.key = key;
      mocks.cache.data = ACCOUNT_EVENT_GROUPS.flatMap((group) => group.events)
        .flatMap((event_type) =>
          ['web', 'email', 'push'].map((channel) => ({
            channel,
            enabled: !mocks.off.has(`${event_type}-${channel}`),
            event_type,
          }))
        )
        .filter(
          (row) => !mocks.missing.has(`${row.event_type}-${row.channel}`)
        );
    }
    return { data: mocks.cache.data, isLoading: false };
  },
  useUpdateAccountNotificationPreferences: () => ({
    mutateAsync: mocks.updateAccount,
  }),
}));

const EMAIL_SWITCH = 'email notifications for marketing_communications';
const EMAIL_WEB_SWITCH = /web notifications for marketing_communications/;

describe('marketing email preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.missing.clear();
    mocks.off.clear();
    mocks.updateAccount.mockResolvedValue({});
  });

  it('only the marketing email preference is marked coming soon', () => {
    expect(isComingSoonPreference('marketing_communications', 'email')).toBe(
      true
    );
    expect(isComingSoonPreference('marketing_communications', 'push')).toBe(
      false
    );
    expect(isComingSoonPreference('security_alerts', 'email')).toBe(false);
  });

  it('shows the email switch off and disabled with a coming-soon note', () => {
    render(<NotificationPreferencesTable scope="account" />);
    const toggle = screen.getByRole('switch', {
      name: new RegExp(EMAIL_SWITCH),
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('marketing-coming-soon');
  });

  it('keeps the other marketing channels and other events working', () => {
    render(<NotificationPreferencesTable scope="account" />);
    const web = screen.getByRole('switch', {
      name: /web notifications for marketing_communications/,
    });
    expect(web).toBeEnabled();
    expect(web).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('switch', {
        name: /email notifications for security_alerts/,
      })
    ).toBeEnabled();
  });

  it('scopes the coming-soon note id to the instance', () => {
    render(<NotificationPreferencesTable scope="account" />);
    const toggle = screen.getByRole('switch', {
      name: new RegExp(EMAIL_SWITCH),
    });
    const id = toggle.getAttribute('aria-describedby') ?? '';
    expect(id).toMatch(/.+-marketing_communications-coming-soon$/);
    expect(id).not.toBe('marketing_communications-coming-soon');
    expect(document.getElementById(id)).toHaveTextContent(
      'marketing-coming-soon'
    );
  });

  it('does not save anything when the disabled switch is clicked', () => {
    render(<NotificationPreferencesTable scope="account" />);
    fireEvent.click(
      screen.getByRole('switch', { name: new RegExp(EMAIL_SWITCH) })
    );
    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });
});

describe('bulk actions and first load never touch the coming-soon pair', () => {
  const savedPairs = () =>
    mocks.updateAccount.mock.calls.flatMap(
      ([input]) =>
        input.preferences as Array<{
          channel: string;
          enabled: boolean;
          eventType: string;
        }>
    );
  const isMarketingEmail = (pair: { channel: string; eventType: string }) =>
    pair.eventType === 'marketing_communications' && pair.channel === 'email';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.missing.clear();
    mocks.off.clear();
    mocks.updateAccount.mockResolvedValue({});
  });

  it('Enable all writes the rest of the group but not marketing email', async () => {
    mocks.off.add('marketing_communications-web');
    render(<NotificationPreferencesTable scope="account" />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Enable all notifications in communications',
      })
    );
    await waitFor(() => expect(mocks.updateAccount).toHaveBeenCalledTimes(1));
    const pairs = savedPairs();
    expect(pairs.some(isMarketingEmail)).toBe(false);
    expect(pairs).toHaveLength(5);
    expect(pairs.every((pair) => pair.enabled)).toBe(true);
    expect(
      screen.getByRole('switch', { name: EMAIL_WEB_SWITCH })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('Disable all writes the rest of the group but not marketing email', async () => {
    render(<NotificationPreferencesTable scope="account" />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Disable all notifications in communications',
      })
    );
    await waitFor(() => expect(mocks.updateAccount).toHaveBeenCalledTimes(1));
    const pairs = savedPairs();
    expect(pairs.some(isMarketingEmail)).toBe(false);
    expect(pairs).toHaveLength(5);
    expect(pairs.every((pair) => !pair.enabled)).toBe(true);
  });

  it('counts the coming-soon pair as neither on nor off', () => {
    mocks.off.add('workspace_activity-web');
    mocks.off.add('workspace_activity-email');
    mocks.off.add('workspace_activity-push');
    mocks.off.add('marketing_communications-web');
    mocks.off.add('marketing_communications-push');
    render(<NotificationPreferencesTable scope="account" />);
    expect(
      screen.getByRole('button', {
        name: 'Disable all notifications in communications',
      })
    ).toBeDisabled();
  });

  it('creates no marketing email row on first load', async () => {
    mocks.missing.add('marketing_communications-email');
    mocks.missing.add('security_alerts-push');
    render(<NotificationPreferencesTable scope="account" />);
    await waitFor(() => expect(mocks.updateAccount).toHaveBeenCalledTimes(1));
    expect(savedPairs()).toEqual([
      { channel: 'push', enabled: true, eventType: 'security_alerts' },
    ]);
  });

  it('writes nothing on first load when only that pair is missing', async () => {
    mocks.missing.add('marketing_communications-email');
    render(<NotificationPreferencesTable scope="account" />);
    expect(
      screen.getByRole('switch', { name: new RegExp(EMAIL_SWITCH) })
    ).toHaveAttribute('aria-checked', 'false');
    await Promise.resolve();
    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });
});
