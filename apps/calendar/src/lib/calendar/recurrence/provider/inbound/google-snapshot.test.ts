import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import { readGoogleSeriesSnapshot } from './google-snapshot';

const master: calendar_v3.Schema$Event = {
  id: 'master',
  etag: 'v1',
  iCalUID: 'fixture@example.invalid',
  recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
  start: {
    dateTime: '2026-03-06T09:00:00-05:00',
    timeZone: 'America/New_York',
  },
  end: { dateTime: '2026-03-06T10:00:00-05:00', timeZone: 'America/New_York' },
};
const cancelled: calendar_v3.Schema$Event = {
  id: 'cancelled',
  status: 'cancelled',
  recurringEventId: 'master',
  originalStartTime: { dateTime: '2026-03-09T13:00:00Z' },
};
function fixture(pages: calendar_v3.Schema$Events[]) {
  const get = vi.fn().mockResolvedValue({ data: master });
  const list = vi
    .fn()
    .mockImplementation(async (...args: [{ pageToken?: string }]) => ({
      data: args[0].pageToken ? pages[1] : pages[0],
    }));
  const api = { events: { get, list } } as unknown as calendar_v3.Calendar;
  const authorize = vi.fn().mockResolvedValue(undefined);
  return {
    get,
    list,
    authorize,
    run: () =>
      readGoogleSeriesSnapshot({
        api,
        calendarId: 'calendar',
        masterId: 'master',
        authorize,
      }),
  };
}
describe('complete non-expanded Google recurrence snapshot', () => {
  it('follows every exception page and includes cancelled slots without an active range filter', async () => {
    const f = fixture([
      { items: [master], nextPageToken: 'next' },
      { items: [cancelled] },
    ]);
    const result = await f.run();
    expect(result.observation.exceptions).toHaveLength(1);
    expect(f.list.mock.calls[1]![0]).toEqual({
      calendarId: 'calendar',
      iCalUID: 'fixture@example.invalid',
      singleEvents: false,
      showDeleted: true,
      maxResults: 1000,
      pageToken: 'next',
    });
    expect(f.get).toHaveBeenCalledTimes(2);
    expect(f.authorize).toHaveBeenCalledTimes(6);
  });
  it('recognizes an authoritative id-only cancelled master without requiring current dates', async () => {
    const f = fixture([]);
    f.get.mockResolvedValue({ data: { id: 'master', status: 'cancelled' } });
    await expect(f.run()).rejects.toThrow('master deleted');
    expect(f.list).not.toHaveBeenCalled();
  });
  it('rejects malformed final pages rather than calling an incomplete snapshot complete', async () => {
    const f = fixture([{ items: [master], nextPageToken: 'next' }, {}]);
    await expect(f.run()).rejects.toThrow('Malformed');
  });
  it('rejects repeated page tokens instead of looping or publishing partial data', async () => {
    const f = fixture([
      { items: [master], nextPageToken: 'next' },
      { items: [], nextPageToken: 'next' },
    ]);
    await expect(f.run()).rejects.toThrow('Incomplete');
  });
  it('detects a concurrent provider master edit before accepting its exceptions', async () => {
    const f = fixture([{ items: [master] }]);
    f.get
      .mockResolvedValueOnce({ data: master })
      .mockResolvedValueOnce({ data: { ...master, etag: 'v2' } });
    await expect(f.run()).rejects.toThrow('changed during snapshot');
  });
  it('detects exception edits even when the master ETag did not change', async () => {
    const f = fixture([{ items: [master, cancelled] }]);
    f.list
      .mockResolvedValueOnce({ data: { items: [master, cancelled] } })
      .mockResolvedValueOnce({ data: { items: [master] } });
    await expect(f.run()).rejects.toThrow('exceptions changed');
  });
  it('rechecks authorization on each read phase', async () => {
    const f = fixture([
      { items: [master], nextPageToken: 'next' },
      { items: [cancelled] },
    ]);
    f.authorize
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Denied'));
    await expect(f.run()).rejects.toThrow('Denied');
    expect(f.list).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched recurring masters instead of importing another source', async () => {
    const f = fixture([
      { items: [{ ...cancelled, recurringEventId: 'another' }] },
    ]);
    await expect(f.run()).rejects.toThrow('source changed');
  });
  it('retains an unsupported rule only after a complete revision-verified snapshot', async () => {
    const rich = {
      ...master,
      recurrence: ['RRULE:FREQ=DAILY;COUNT=5;BYHOUR=9,11'],
    };
    const f = fixture([{ items: [rich, cancelled] }]);
    f.get.mockResolvedValue({ data: rich });
    await expect(f.run()).rejects.toMatchObject({
      name: 'ProviderSeriesUnsupportedError',
      snapshot: {
        provider: 'google',
        masterId: 'master',
        etag: 'v1',
        master: { recurrence: rich.recurrence },
        exceptions: [cancelled],
      },
    });
    expect(f.get).toHaveBeenCalledTimes(2);
  });
  it('never classifies an unstable unsupported rule as a readonly snapshot', async () => {
    const rich = {
      ...master,
      recurrence: ['RRULE:FREQ=DAILY;COUNT=5;BYHOUR=9,11'],
    };
    const f = fixture([{ items: [rich] }]);
    f.get
      .mockResolvedValueOnce({ data: rich })
      .mockResolvedValueOnce({ data: { ...rich, etag: 'v2' } });
    await expect(f.run()).rejects.toThrow('changed during snapshot');
  });
});
