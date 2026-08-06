import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSession: vi.fn(),
}));

vi.mock('../auth', () => ({
  getSatelliteAppSession: mocks.getSatelliteAppSession,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@tuturuuu/ui/custom/notification-popover-client', () => ({
  default: ({ userId }: { userId?: string }) => (
    <div data-testid="notification-popover" data-user-id={userId} />
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
});
