import type { createGraphClient } from '@tuturuuu/microsoft';
import { describe, expect, it, vi } from 'vitest';
import { readGraphSeriesSnapshot } from './graph-snapshot';

const master = {
  id: 'master',
  '@odata.etag': 'v1',
  type: 'seriesMaster',
  subject: 'Fixture',
  start: { dateTime: '2026-10-01T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-10-01T10:00:00', timeZone: 'UTC' },
  recurrence: {
    pattern: { type: 'daily', interval: 1 },
    range: {
      type: 'numbered',
      startDate: '2026-10-01',
      numberOfOccurrences: 1,
      recurrenceTimeZone: 'UTC',
    },
  },
  exceptionOccurrences: [],
  cancelledOccurrences: [],
};
const occurrence = {
  ...master,
  id: 'one',
  type: 'occurrence',
  seriesMasterId: 'master',
  originalStart: '2026-10-01T09:00:00Z',
};
function fixture(
  views: unknown[] = [{ value: [occurrence] }, { value: [occurrence] }],
  masters: unknown[] = [master, master]
) {
  const calls: {
    path: string;
    header?: string;
    query?: Record<string, unknown>;
  }[] = [];
  const api = {
    api(path: string) {
      const call: (typeof calls)[number] = { path };
      calls.push(call);
      const request = {
        header(_name: string, value: string) {
          call.header = value;
          return request;
        },
        query(value: Record<string, unknown>) {
          call.query = value;
          return request;
        },
        async get() {
          return path.includes('calendarView')
            ? views.shift()
            : masters.shift();
        },
      };
      return request;
    },
  } as unknown as ReturnType<typeof createGraphClient>;
  const authorize = vi.fn().mockResolvedValue(undefined);
  return {
    calls,
    authorize,
    run: () =>
      readGraphSeriesSnapshot({
        api,
        calendarId: 'calendar',
        masterId: 'master',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T00:00:00Z',
        authorize,
      }),
  };
}
describe('complete stable Outlook series reads', () => {
  it('uses immutable IDs for masters and every view and proves separate occurrence stability', async () => {
    const f = fixture();
    expect((await f.run()).observation.exceptions).toEqual([]);
    expect(f.calls).toHaveLength(4);
    expect(
      f.calls.every(
        (call) => call.header === 'IdType="ImmutableId", outlook.timezone="UTC"'
      )
    ).toBe(true);
    expect(f.calls[0]?.query?.$expand).toBe('exceptionOccurrences');
    expect(f.calls[3]?.query?.$expand).toBe('exceptionOccurrences');
    expect(f.authorize).toHaveBeenCalledTimes(5);
  });
  it('does not infer cancellation from a changing snapshot', async () => {
    const f = fixture([{ value: [] }, { value: [occurrence] }]);
    await expect(f.run()).rejects.toThrow('occurrences changed');
  });
  it('detects independently changed exceptions even if master ETag stays the same', async () => {
    const f = fixture(undefined, [
      master,
      { ...master, exceptionOccurrences: [{ id: 'new' }] },
    ]);
    await expect(f.run()).rejects.toThrow('series changed');
  });
  it('fails on unexpanded exception continuation before using a partial set', async () => {
    const f = fixture(undefined, [
      { ...master, 'exceptionOccurrences@odata.nextLink': 'opaque' },
    ]);
    await expect(f.run()).rejects.toThrow('Incomplete');
    expect(f.calls).toHaveLength(1);
  });
  it('recognizes authoritative cancellation without requiring master recurrence fields', async () => {
    const f = fixture(undefined, [{ id: 'master', isCancelled: true }]);
    await expect(f.run()).rejects.toThrow('master deleted');
  });
  it('checks authorization again before the verification view', async () => {
    const f = fixture();
    f.authorize
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Denied'));
    await expect(f.run()).rejects.toThrow('Denied');
    expect(f.calls).toHaveLength(1);
  });
  it('retains unsupported Graph rules only after complete view and expanded exceptions agree', async () => {
    const rich = {
      ...master,
      recurrence: {
        ...master.recurrence,
        pattern: { type: 'futureUnsupportedPattern', interval: 1 },
      },
    };
    const f = fixture(undefined, [rich, rich]);
    await expect(f.run()).rejects.toMatchObject({
      name: 'ProviderSeriesUnsupportedError',
      snapshot: {
        provider: 'microsoft',
        masterId: 'master',
        etag: 'v1',
        master: rich,
        exceptions: [],
      },
    });
    expect(f.calls).toHaveLength(4);
  });
});
