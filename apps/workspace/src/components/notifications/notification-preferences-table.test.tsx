// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_EVENT_GROUPS,
  isComingSoonPreference,
} from '@/constants/notification-event-groups';
import NotificationPreferencesTable from './notification-preferences-table';

const mocks = vi.hoisted(() => ({ updateAccount: vi.fn() }));

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
  useAccountNotificationPreferences: () => ({
    data: ACCOUNT_EVENT_GROUPS.flatMap((group) => group.events).flatMap(
      (event_type) =>
        ['web', 'email', 'push'].map((channel) => ({
          channel,
          enabled: true,
          event_type,
        }))
    ),
    isLoading: false,
  }),
  useUpdateAccountNotificationPreferences: () => ({
    mutateAsync: mocks.updateAccount,
  }),
}));

const EMAIL_SWITCH = 'email notifications for marketing_communications';

describe('marketing email preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('does not save anything when the disabled switch is clicked', () => {
    render(<NotificationPreferencesTable scope="account" />);
    fireEvent.click(
      screen.getByRole('switch', { name: new RegExp(EMAIL_SWITCH) })
    );
    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });
});
