import { describe, expect, it } from 'vitest';
import { mergeProviderCalendarsByAccount } from './merge-provider-calendars';

describe('mergeProviderCalendarsByAccount', () => {
  it('keeps persisted calendars visible while provider refresh is unavailable', () => {
    const result = mergeProviderCalendarsByAccount({
      wsId: 'workspace-1',
      accounts: [
        {
          id: 'account-1',
          provider: 'google',
          account_email: 'member@example.com',
          account_name: 'Member',
          is_active: true,
          created_at: '2026-07-20T00:00:00Z',
          expires_at: null,
        },
      ],
      calendarConnections: [
        {
          id: 'connection-1',
          ws_id: 'workspace-1',
          calendar_id: 'provider-calendar-1',
          calendar_name: 'Stored calendar',
          is_enabled: true,
          color: '#123456',
          provider: 'google',
          auth_token_id: 'account-1',
          created_at: '2026-07-20T00:00:00Z',
          updated_at: '2026-07-20T00:00:00Z',
        },
      ],
      liveCalendarsByAccount: { 'account-1': [] },
    });

    expect(result['account-1']).toEqual([
      expect.objectContaining({
        id: 'connection-1',
        calendar_name: 'Stored calendar',
        is_enabled: true,
        connectionExists: true,
        isFromAPI: false,
      }),
    ]);
  });
});
