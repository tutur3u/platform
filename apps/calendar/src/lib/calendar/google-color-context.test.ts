import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import {
  getGoogleColorContext,
  refreshGoogleColorContext,
} from './google-color-context';

function client(source: unknown, palette: unknown, details: unknown) {
  return {
    calendarList: { get: vi.fn().mockResolvedValue({ data: source }) },
    colors: { get: vi.fn().mockResolvedValue({ data: palette }) },
    calendars: { get: vi.fn().mockResolvedValue({ data: details }) },
  } as unknown as calendar_v3.Calendar;
}
describe('Google color context refresh', () => {
  it('refreshes source RGB even when only the source color changes', async () => {
    const calendar = client(
      { colorId: '1', backgroundColor: '#d06b64', foregroundColor: '#000000' },
      {
        calendar: { '1': { background: '#9fc6e7' } },
        event: { '7': { background: '#039be5' } },
      },
      {
        labelProperties: {
          eventLabels: [{ id: 'label', backgroundColor: '#aabbcc' }],
        },
      }
    );
    expect(await getGoogleColorContext(calendar, 'personal')).toMatchObject({
      calendarBackground: '#d06b64',
      eventColors: { '7': { background: '#039be5' } },
      eventLabels: [{ id: 'label', backgroundColor: '#aabbcc' }],
    });
    expect(calendar.calendarList.get).toHaveBeenCalledWith({
      calendarId: 'personal',
    });
  });
  it('uses calendar definitions only when custom RGB is absent', async () => {
    expect(
      await getGoogleColorContext(
        client(
          { colorId: '7' },
          {
            calendar: { '7': { background: '#7bd148' } },
            event: { '7': { background: '#039be5' } },
          },
          {}
        ),
        'travel'
      )
    ).toMatchObject({ calendarBackground: '#7bd148' });
  });
  it('makes metadata read failure observable without fabricating a color', async () => {
    const calendar = client({}, {}, {});
    vi.mocked(calendar.colors.get).mockRejectedValueOnce(
      new Error('unavailable')
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getGoogleColorContext(calendar, 'travel')).toMatchObject({
      calendarBackground: null,
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});

it('refreshes only the matching authenticated source connection without changing event rows', async () => {
  const query = { update: vi.fn(), eq: vi.fn() };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const supabase = { from: vi.fn().mockReturnValue(query) };
  await refreshGoogleColorContext({
    calendar: client({ backgroundColor: '#d06b64' }, {}, {}),
    calendarId: 'personal',
    wsId: 'workspace',
    authTokenId: 'account',
    supabase: supabase as unknown as Parameters<
      typeof refreshGoogleColorContext
    >[0]['supabase'],
  });
  expect(supabase.from).toHaveBeenCalledExactlyOnceWith('calendar_connections');
  expect(query.update).toHaveBeenCalledWith({ color: '#d06b64' });
  expect(query.eq.mock.calls).toEqual([
    ['ws_id', 'workspace'],
    ['auth_token_id', 'account'],
    ['calendar_id', 'personal'],
    ['provider', 'google'],
  ]);
});

for (const failure of ['builder', 'promise'] as const) {
  it(`retains fetched context when source color persistence fails: ${failure}`, async () => {
    const sensitive = 'synthetic-private-database-detail';
    const query = { update: vi.fn(), eq: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    if (failure === 'promise') {
      query.eq.mockImplementationOnce(() => query);
      query.eq.mockImplementationOnce(() => query);
      query.eq.mockImplementationOnce(() => query);
      query.eq.mockRejectedValueOnce(new Error(sensitive));
    }
    const supabase = {
      from:
        failure === 'builder'
          ? vi.fn(() => {
              throw new Error(sensitive);
            })
          : vi.fn().mockReturnValue(query),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const context = await refreshGoogleColorContext({
        calendar: client(
          { backgroundColor: '#d06b64' },
          { event: { '7': { background: '#039be5' } } },
          {
            labelProperties: {
              eventLabels: [{ id: 'label', backgroundColor: '#aabbcc' }],
            },
          }
        ),
        calendarId: 'personal',
        wsId: 'workspace',
        authTokenId: 'account',
        supabase: supabase as unknown as Parameters<
          typeof refreshGoogleColorContext
        >[0]['supabase'],
      });
      expect(context).toMatchObject({
        calendarBackground: '#d06b64',
        eventColors: { '7': { background: '#039be5' } },
        eventLabels: [{ id: 'label', backgroundColor: '#aabbcc' }],
      });
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        'Google source color refresh failed'
      );
      expect(JSON.stringify(warning.mock.calls)).not.toContain(sensitive);
    } finally {
      warning.mockRestore();
    }
  });
}
