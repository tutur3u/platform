import { expect, it, vi } from 'vitest';
import { getCalendarInvitationCapabilities } from './calendar-invitation-capabilities';
it.each(['google', 'microsoft'] as const)(
  'reads %s capability with scoped identifiers and no cache',
  async (provider) => {
    const response = {
      provider,
      connectionId: 'selected',
      calendarId: 'calendar',
      invitationCreates: true,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => response });
    expect(
      await getCalendarInvitationCapabilities(
        'ws/path',
        { provider, connectionId: 'selected' },
        { baseUrl: 'https://calendar.test', fetch }
      )
    ).toEqual(response);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://calendar.test/api/v1/workspaces/ws%2Fpath/calendar/invitation-capabilities?provider=${provider}&connectionId=selected`,
      expect.objectContaining({ cache: 'no-store' })
    );
  }
);
