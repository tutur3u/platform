import type { Client } from '@microsoft/microsoft-graph-client';
import { describe, expect, test } from 'vitest';
import { fetchCalendarViewPages } from './pagination';

const continuation =
  'https://graph.microsoft.com/v1.0/me/calendars/cal/calendarView?$skiptoken=opaque';
function graph(pages: unknown[]) {
  const calls: { path: string; header?: string; query?: unknown }[] = [];
  const client = {
    api(path: string) {
      const call = { path } as (typeof calls)[number];
      calls.push(call);
      const request = {
        header(_name: string, value: string) {
          call.header = value;
          return request;
        },
        query(value: unknown) {
          call.query = value;
          return request;
        },
        async get() {
          const response = pages.shift();
          if (response instanceof Error) throw response;
          return response;
        },
      };
      return request;
    },
  } as unknown as Client;
  return { client, calls };
}
const fetch = (client: Client, id = 'cal') =>
  fetchCalendarViewPages(
    client,
    id,
    '2026-01-01T00:00:00Z',
    '2027-01-01T00:00:00Z'
  );

describe('complete Outlook calendar snapshots', () => {
  test('follows opaque continuation and repeats UTC preference without rewriting query', async () => {
    const { client, calls } = graph([
      { value: [{ id: 'a' }], '@odata.nextLink': continuation },
      { value: [{ id: 'b' }] },
    ]);
    expect(await fetch(client)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(calls[1]?.path).toBe(continuation);
    expect(calls[1]?.query).toBeUndefined();
    expect(calls.map((call) => call.header)).toEqual([
      'outlook.timezone="UTC"',
      'outlook.timezone="UTC"',
    ]);
  });
  test('deduplicates repeated provider identities, retaining latest page', async () => {
    const { client } = graph([
      { value: [{ id: 'a', subject: 'old' }], '@odata.nextLink': continuation },
      { value: [{ id: 'a', subject: 'new' }] },
    ]);
    expect(await fetch(client)).toEqual([{ id: 'a', subject: 'new' }]);
  });
  test('encodes calendar IDs as one path segment', async () => {
    const { client, calls } = graph([{ value: [] }]);
    await fetch(client, 'cal/+?');
    expect(calls[0]?.path).toBe('/me/calendars/cal%2F%2B%3F/calendarView');
  });
  test('throws on failed later page instead of returning destructive partial snapshot', async () => {
    const { client } = graph([
      { value: [{ id: 'a' }], '@odata.nextLink': continuation },
      new Error('429'),
    ]);
    await expect(fetch(client)).rejects.toThrow('429');
  });
  test.each([
    'https://attacker.example/v1.0/me/calendars/cal/calendarView',
    'https://graph.microsoft.com/v1.0/me/messages',
    'https://graph.microsoft.com/v1.0/me/calendars/other/calendarView',
    'https://user:pass@graph.microsoft.com/v1.0/me/calendars/cal/calendarView',
    `${continuation}#fragment`,
    '',
  ])(
    'rejects unsafe continuation %s before a second authenticated request',
    async (link) => {
      const { client, calls } = graph([{ value: [], '@odata.nextLink': link }]);
      await expect(fetch(client)).rejects.toThrow();
      expect(calls).toHaveLength(1);
    }
  );
  test.each([{}, { value: null }, { value: [{ id: '' }] }, { value: [null] }])(
    'rejects malformed snapshots',
    async (page) => {
      const { client } = graph([page]);
      await expect(fetch(client)).rejects.toThrow();
    }
  );
  test('rejects a repeated nextLink', async () => {
    const { client } = graph([
      { value: [], '@odata.nextLink': continuation },
      { value: [], '@odata.nextLink': continuation },
    ]);
    await expect(fetch(client)).rejects.toThrow('loop');
  });
  test('bounds unique pages without returning truncated data', async () => {
    const { client, calls } = graph(
      Array.from({ length: 50 }, (_, i) => ({
        value: [],
        '@odata.nextLink': `${continuation}${i}`,
      }))
    );
    await expect(fetch(client)).rejects.toThrow('limit');
    expect(calls).toHaveLength(50);
  });
});
