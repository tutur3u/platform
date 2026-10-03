import { describe, expect, it, vi } from 'vitest';
import { updateWorkspaceCalendarEvent } from './calendar';
import { getGoogleCalendarColorOptions } from './calendar-colors';

describe('Google color API client', () => {
  it('scopes selectable colors to the workspace and connection with no cached provider palette', async () => {
    const response = {
      provider: 'google',
      connectionId: 'connection',
      calendarId: 'source',
      sourceColor: { background: '#d06b64', foreground: null },
      options: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => response });
    expect(
      await getGoogleCalendarColorOptions('ws/source', 'connection', {
        baseUrl: 'https://internal.example',
        fetch: fetchMock as typeof fetch,
      })
    ).toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example/api/v1/workspaces/ws%2Fsource/calendar/colors?connectionId=connection',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
  it('serializes provider identity instead of arbitrary color metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'event' }),
    });
    const providerColor = {
      connectionId: 'connection',
      kind: 'inherit' as const,
    };
    await updateWorkspaceCalendarEvent(
      'ws',
      'event',
      { providerColor },
      { baseUrl: 'https://internal.example', fetch: fetchMock as typeof fetch }
    );
    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({ providerColor })
    );
  });
});
