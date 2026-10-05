import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: vi.fn(),
  decryptEventFromStorage: vi.fn(),
  getWorkspaceKey: vi.fn(),
}));

import { CalendarSeriesError } from '../../service';
import { verifyGraphLegacySeriesIdentities } from './graph-legacy-identities';
import type { InboundProviderAccess } from './service';

function fixture(ids = ['mutable-old-slot']) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ['select', 'eq', 'not', 'order'])
    query[name] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({
    data: ids.map((external_event_id) => ({ external_event_id })),
    error: null,
  }));
  const from = vi.fn(() => query);
  const post = vi.fn(
    async ({ requests }: { requests: Array<{ id: string; url: string }> }) => ({
      responses: requests.map((request) => ({
        id: request.id,
        status: 200,
        body: {
          id: decodeURIComponent(
            new URL(request.url, 'https://graph.invalid').pathname.split(
              '/events/'
            )[1]!
          ),
          type: 'occurrence',
          seriesMasterId: 'master',
        },
      })),
    })
  );
  const translate = vi.fn(async ({ inputIds }: { inputIds: string[] }) => ({
    value: inputIds.map((sourceId) => ({
      sourceId,
      targetId: `immutable-${sourceId}`,
    })),
  }));
  const api = {
    api: vi.fn((path: string) => ({
      post: path === '/me/translateExchangeIds' ? translate : post,
    })),
  };
  const authorize = vi.fn(async () => {});
  const access = {
    supabase: { from },
    wsId: 'workspace',
    actorId: 'actor',
    connectionId: 'connection',
    provider: 'microsoft',
    calendarId: 'calendar/id',
  } as unknown as InboundProviderAccess;
  return {
    query,
    from,
    post,
    translate,
    api,
    authorize,
    access,
    run: () =>
      verifyGraphLegacySeriesIdentities({
        access,
        api: api as never,
        authorize,
        masters: new Set(['master']),
      }),
  };
}

describe('Outlook legacy identity verification', () => {
  it('verifies mutable rows outside the viewport against only their authorized source, and preserves local IDs for atomic cleanup', async () => {
    const f = fixture(['mutable-old-slot/encoded']);
    expect(await f.run()).toEqual(
      new Map([['master', ['mutable-old-slot/encoded']]])
    );
    expect(f.from).toHaveBeenCalledWith('workspace_calendar_events');
    expect(f.query.eq).toHaveBeenCalledWith('ws_id', 'workspace');
    expect(f.query.eq).toHaveBeenCalledWith('provider', 'microsoft');
    expect(f.query.eq).toHaveBeenCalledWith(
      'external_calendar_id',
      'calendar/id'
    );
    expect(f.query.limit).toHaveBeenCalledWith(1001);
    expect(f.authorize).toHaveBeenCalledTimes(3);
    expect(f.post.mock.calls[0]?.[0].requests).toEqual([
      {
        id: '0',
        method: 'GET',
        url: '/me/calendars/calendar%2Fid/events/immutable-mutable-old-slot%2Fencoded?$select=id,type,seriesMasterId',
        headers: { Prefer: 'IdType="ImmutableId"' },
      },
    ]);
  });
  it('does not attribute other masters or single events even when they provide a master-looking field', async () => {
    const f = fixture(['other', 'single', 'known']);
    f.post.mockResolvedValueOnce({
      responses: [
        {
          id: '0',
          status: 200,
          body: {
            id: 'immutable-other',
            type: 'occurrence',
            seriesMasterId: 'other-master',
          },
        },
        {
          id: '1',
          status: 200,
          body: {
            id: 'immutable-single',
            type: 'singleInstance',
            seriesMasterId: 'master',
          },
        },
        {
          id: '2',
          status: 200,
          body: {
            id: 'immutable-known',
            type: 'exception',
            seriesMasterId: 'master',
          },
        },
      ],
    });
    expect(await f.run()).toEqual(new Map([['master', ['known']]]));
  });
  it('never attributes missing remote events to a master', async () => {
    const f = fixture();
    f.post.mockResolvedValueOnce({
      responses: [{ id: '0', status: 404, body: {} as never }],
    });
    expect(await f.run()).toEqual(new Map());
  });
  it.each([401, 403, 429, 500])(
    'fails closed for a partial %s response rather than suppressing any legacy rows',
    async (status) => {
      const f = fixture();
      f.post.mockResolvedValueOnce({
        responses: [{ id: '0', status, body: {} as never }],
      });
      await expect(f.run()).rejects.toMatchObject({
        status: 503,
        code: 'PROVIDER_IDENTITY_UNAVAILABLE',
      });
    }
  );
  it.each(
    [
      [],
      [
        {
          id: 'wrong',
          status: 200,
          body: { id: 'x', type: 'occurrence', seriesMasterId: 'master' },
        },
      ],
      [
        {
          id: '0',
          status: 200,
          body: { id: 'x', type: 'unsupported', seriesMasterId: 'master' },
        },
      ],
    ].map((responses) => ({ responses }))
  )('rejects incomplete or malformed batch receipts', async ({ responses }) => {
    const f = fixture();
    f.post.mockResolvedValueOnce({ responses: responses as never });
    await expect(f.run()).rejects.toThrow('identity verification unavailable');
  });
  it('rejects duplicate receipt IDs even when the response count matches', async () => {
    const f = fixture(['first', 'second']);
    const response = {
      id: '0',
      status: 200,
      body: { id: 'x', type: 'occurrence', seriesMasterId: 'master' },
    };
    f.post.mockResolvedValueOnce({ responses: [response, response] });
    await expect(f.run()).rejects.toThrow();
  });
  it('does not issue provider reads after source permission revocation', async () => {
    const f = fixture();
    f.authorize.mockRejectedValueOnce(
      new CalendarSeriesError('revoked', 403, 'DENIED')
    );
    await expect(f.run()).rejects.toMatchObject({ status: 403 });
    expect(f.from).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
  });
  it('rechecks permission before each batch and never publishes a partially verified result', async () => {
    const f = fixture();
    f.authorize
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new CalendarSeriesError('revoked', 403, 'DENIED'));
    await expect(f.run()).rejects.toMatchObject({ status: 403 });
    expect(f.post).not.toHaveBeenCalled();
  });
  it('rejects source-wide overflow instead of processing an incomplete prefix', async () => {
    const f = fixture(Array.from({ length: 1001 }, (_, i) => `legacy-${i}`));
    await expect(f.run()).rejects.toThrow();
    expect(f.post).not.toHaveBeenCalled();
  });
  it('uses bounded batches and deduplicates persisted IDs', async () => {
    const ids = Array.from({ length: 61 }, (_, i) => `legacy-${i}`);
    const f = fixture([...ids, ids[0]!]);
    const result = await f.run();
    expect(f.post).toHaveBeenCalledTimes(4);
    expect(f.post.mock.calls.map(([args]) => args.requests.length)).toEqual([
      20, 20, 20, 1,
    ]);
    expect(result.get('master')).toEqual(ids);
    expect(f.authorize).toHaveBeenCalledTimes(6);
  });
  it('requires an explicit complete ID translation before any calendar lookup', async () => {
    const f = fixture(['first', 'second']);
    f.translate.mockResolvedValueOnce({
      value: [{ sourceId: 'first', targetId: 'immutable-first' }],
    });
    await expect(f.run()).rejects.toThrow('identity verification unavailable');
    expect(f.post).not.toHaveBeenCalled();
  });
  it('refuses a receipt for a different event even if its master is known', async () => {
    const f = fixture();
    f.post.mockResolvedValueOnce({
      responses: [
        {
          id: '0',
          status: 200,
          body: {
            id: 'foreign-event',
            type: 'occurrence',
            seriesMasterId: 'master',
          },
        },
      ],
    });
    await expect(f.run()).rejects.toThrow('identity verification unavailable');
  });
  it('sanitizes transport failures without exposing raw provider error objects', async () => {
    const f = fixture();
    f.post.mockRejectedValueOnce(
      new Error('sensitive provider transport details')
    );
    await expect(f.run()).rejects.toThrow(
      'Provider legacy identity verification unavailable'
    );
  });
});
