import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSession: vi.fn(),
}));

vi.mock('../auth', () => ({
  getSatelliteAppSession: mocks.getSatelliteAppSession,
}));

// Models an app bundle that ships the calendar notification keys.
// Models an app bundle that ships the calendar code keys and part of the
// popover labels, with ICU placeholders kept raw.
const messages = vi.hoisted<Record<string, string>>(() => ({
  'notifications.unread': 'Chưa đọc',
  'notifications.popover-unread-count': '{count} chưa đọc',
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () =>
    Object.assign((key: string) => key, {
      has: (key: string) =>
        key in messages ||
        key.startsWith('notifications.codes.calendar_reconnect_required.'),
      raw: (key: string) => messages[key] ?? key,
    })
  ),
}));

vi.mock('@tuturuuu/ui/custom/notification-popover-client', () => ({
  default: ({
    userId,
    codeText,
    labels,
  }: {
    userId?: string;
    codeText?: unknown;
    labels?: unknown;
  }) => (
    <div
      data-testid="notification-popover"
      data-user-id={userId}
      data-code-text={JSON.stringify(codeText)}
      data-labels={JSON.stringify(labels)}
    />
  ),
}));

import NotificationPopover from './notification-popover';

describe('NotificationPopover', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a resolved identity without repeating app-session auth', async () => {
    render(await NotificationPopover({ userId: 'user-1' }));

    expect(
      screen.getByTestId('notification-popover').getAttribute('data-user-id')
    ).toBe('user-1');
    expect(mocks.getSatelliteAppSession).not.toHaveBeenCalled();
  });

  it('uses the app-session identity when no resolved user is supplied', async () => {
    mocks.getSatelliteAppSession.mockResolvedValueOnce({ sub: 'app-user-1' });

    render(await NotificationPopover());

    expect(
      screen.getByTestId('notification-popover').getAttribute('data-user-id')
    ).toBe('app-user-1');
  });

  it('passes localized text for notification codes the bundle translates', async () => {
    render(await NotificationPopover({ userId: 'user-1' }));

    expect(
      JSON.parse(
        screen
          .getByTestId('notification-popover')
          .getAttribute('data-code-text') ?? '{}'
      )
    ).toEqual({
      calendar_reconnect_required: {
        title: 'notifications.codes.calendar_reconnect_required.title',
        description:
          'notifications.codes.calendar_reconnect_required.description',
      },
    });
  });

  it('passes bundle labels raw and falls back to English for missing keys', async () => {
    render(await NotificationPopover({ userId: 'user-1' }));

    const labels = JSON.parse(
      screen.getByTestId('notification-popover').getAttribute('data-labels') ??
        '{}'
    );
    expect(labels.unread).toBe('Chưa đọc');
    expect(labels.unreadCount).toBe('{count} chưa đọc');
    expect(labels.markAllRead).toBe('Mark all as read');
  });
});
