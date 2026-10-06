import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ fixture: null as any, legacy: vi.fn() }));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: class {
    setCredentials() {}
  },
  google: { calendar: () => m.fixture.calendar },
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: () => m.fixture.authorize(),
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSourceForEvent: async () => m.fixture.source,
  resolveCalendarSource: async ({
    source,
  }: {
    source?: { provider: string };
  }) =>
    source?.provider === 'tuturuuu'
      ? {
          provider: 'tuturuuu',
          workspaceCalendarId: 'distinct-native-destination',
        }
      : m.fixture.source,
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventFromStorage: async (event: unknown) => event,
  encryptEventForStorage: m.legacy,
  getWorkspaceKey: m.legacy,
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createProviderEvent: m.legacy,
  deleteProviderEvent: m.legacy,
  moveProviderEvent: m.legacy,
  updateProviderEvent: m.legacy,
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: m.legacy,
  resolveOutboundSyncSource: m.legacy,
}));
vi.mock('@/lib/calendar/habit-skips', () => ({ upsertHabitSkip: m.legacy }));
vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: async () => {},
}));

import {
  DELETE as CANCEL,
  POST as RECOVER,
  GET as STATUS,
} from '@/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/color-operation/route';
import {
  DELETE,
  PUT,
} from '@/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route';
import {
  recoverableColorRouteFixture,
  routeFixtureIds,
} from '../test-fixtures/recoverable-color-route';

const params = () => ({
  params: Promise.resolve({
    wsId: routeFixtureIds.ws,
    eventId: routeFixtureIds.event,
  }),
});
const request = (method: string, body?: unknown) =>
  new Request('https://fixture.invalid/events', {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
  });
const choice = (id: string) => ({
  providerColor: {
    connectionId: routeFixtureIds.connection,
    kind: 'event',
    id,
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  m.fixture = recoverableColorRouteFixture();
  vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('actual recoverable color route vertical slice', () => {
  it.each([
    { readonly: true, status: 422, code: 'PROVIDER_RULE_READ_ONLY' },
    { readonly: null, status: 503, code: 'PROVIDER_STATE_UNAVAILABLE' },
  ])(
    'blocks writes before color admission when readonly state is $readonly',
    async ({ readonly, status, code }) => {
      const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
      f.providerReadonly(readonly);
      for (const response of [
        await PUT(request('PUT', choice('7')), params()),
        await DELETE(request('DELETE'), params()),
      ]) {
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ code });
      }
      expect(f.operation()).toBeNull();
      expect(f.get).not.toHaveBeenCalled();
      expect(f.patch).not.toHaveBeenCalled();
      expect(f.rowWrites).not.toHaveBeenCalled();
      expect(m.legacy).not.toHaveBeenCalled();
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
        'calendar_provider_series_is_readonly',
        'calendar_provider_series_is_readonly',
      ]);
    }
  );
  it('fences delayed A across A recovery and successor B using original If-Match', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    const delayed = f.delayPatch();
    const a = PUT(request('PUT', choice('11')), params());
    await delayed.entered.promise;
    const operationA = f.operation()!;
    const blockedB = await PUT(request('PUT', choice('7')), params());
    expect(blockedB.status).toBe(409);
    expect(f.patch).toHaveBeenCalledTimes(1);
    f.concurrentMetadata();
    const recoveredA = await RECOVER(
      request('POST', { operationId: operationA.id }),
      params()
    );
    expect(recoveredA.status).toBe(200);
    const b = await PUT(request('PUT', choice('7')), params());
    expect(b.status).toBe(200);
    delayed.release.release();
    expect((await a).status).toBe(409);
    expect(f.providerColor()).toBe('7');
    expect(f.event.scheduling_metadata.google_color).toMatchObject({
      color_id: '7',
    });
    expect(f.event.scheduling_metadata).toMatchObject({
      custom: { keep: true },
      concurrent: { keep: true },
    });
    expect(f.patch.mock.calls[0]?.[1].headers['If-Match']).toBe(
      'opaque:original'
    );
    expect(f.patch.mock.calls[1]?.[1].headers['If-Match']).toBe(
      'opaque:original'
    );
    expect(f.rowWrites).not.toHaveBeenCalled();
  });
  it('retains successful provider result after DB failure and recovers without refreshing precondition', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failFinalize(true);
    const failed = await PUT(request('PUT', choice('7')), params());
    expect(failed.status).toBe(503);
    const failureBody = await failed.json();
    const { operationId } = failureBody;
    expect(f.providerColor()).toBe('7');
    expect(f.operation()?.phase).toBe('dispatched');
    expect(JSON.stringify(failureBody)).not.toContain('fixture-private');
    f.failFinalize(false);
    const recovered = await RECOVER(request('POST', { operationId }), params());
    expect(recovered.status).toBe(200);
    expect(f.event.scheduling_metadata.google_color).toMatchObject({
      color_id: '7',
    });
    expect(f.patch.mock.calls[1]?.[1].headers['If-Match']).toBe(
      'opaque:original'
    );
  });
  it('leaves provider failure recoverable and refuses force cancel after dispatch', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    const failed = await PUT(request('PUT', choice('7')), params());
    expect(failed.status).toBe(503);
    const { operationId } = await failed.json();
    expect(
      (await CANCEL(request('DELETE', { operationId }), params())).status
    ).toBe(409);
    expect(f.operation()?.phase).toBe('dispatched');
    f.failPatch(false);
    expect(
      (await RECOVER(request('POST', { operationId }), params())).status
    ).toBe(200);
  });
  it.each([{ title: 'cleartext-must-never-be-persisted' }, { locked: true }])(
    'blocks content/local successors behind an unsettled color operation',
    async (updates) => {
      const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
      f.failPatch(true);
      expect((await PUT(request('PUT', choice('7')), params())).status).toBe(
        503
      );
      const attempts = f.patch.mock.calls.length;
      m.legacy.mockClear();
      const response = await PUT(request('PUT', updates), params());
      expect(response.status).toBe(409);
      expect(m.legacy).not.toHaveBeenCalled();
      expect(f.patch).toHaveBeenCalledTimes(attempts);
      expect(f.rowWrites).not.toHaveBeenCalled();
    }
  );
  it('rejects source movement combined with content before provider admission', async () => {
    const response = await PUT(
      request('PUT', {
        source: { provider: 'tuturuuu' },
        title: 'Unsupported combined move',
      }),
      params()
    );
    expect(response.status).toBe(409);
    expect(m.legacy).not.toHaveBeenCalled();
    expect(m.fixture.patch).not.toHaveBeenCalled();
    expect(m.fixture.rpc.mock.calls.map(([name]: [string]) => name)).toEqual([
      'calendar_provider_series_is_readonly',
      'calendar_retained_generation',
    ]);
  });
  it('blocks deletion behind a pending color operation before habit/task side effects', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    await PUT(request('PUT', choice('7')), params());
    const attempts = f.patch.mock.calls.length;
    m.legacy.mockClear();
    expect((await DELETE(request('DELETE'), params())).status).toBe(409);
    expect(m.legacy).not.toHaveBeenCalled();
    expect(f.patch).toHaveBeenCalledTimes(attempts);
    expect(f.rowWrites).not.toHaveBeenCalled();
  });
  it.each([
    { source: { provider: 'tuturuuu' } },
    { generation: '0' },
    { force: true },
  ])('refuses forged recovery field %j', async (forged) => {
    const response = await RECOVER(
      request('POST', {
        operationId: routeFixtureIds.token,
        ...forged,
      }),
      params()
    );
    expect(response.status).toBe(400);
    expect(m.fixture.patch).not.toHaveBeenCalled();
  });
  it('exposes only dedicated status ID/phase and keeps reservation out of event metadata', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    await PUT(request('PUT', choice('7')), params());
    const response = await STATUS(request('GET'), params());
    const body = await response.json();
    expect(Object.keys(body.operation).sort()).toEqual([
      'operationId',
      'phase',
    ]);
    expect(JSON.stringify(f.event.scheduling_metadata)).not.toMatch(
      /operationId|prepared|requestHash|authTokenId/
    );
    expect(JSON.stringify(f.operation())).not.toContain('ciphertext-fixture');
  });
  it('reauthorizes recovery and never dispatches after token revocation', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    await PUT(request('PUT', choice('7')), params());
    const operationId = f.operation()!.id;
    f.tokenActive(false);
    const attempts = f.patch.mock.calls.length;
    expect(
      (await RECOVER(request('POST', { operationId }), params())).status
    ).toBe(403);
    expect(f.patch).toHaveBeenCalledTimes(attempts);
  });

  it('keeps preparation validation safely cancelable without provider dispatch', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    expect(
      (await PUT(request('PUT', choice('unknown')), params())).status
    ).toBe(409);
    expect(f.operation()?.phase).toBe('canceled');
    expect(f.patch).not.toHaveBeenCalled();
    expect((await PUT(request('PUT', choice('7')), params())).status).toBe(200);
  });
  it('preserves provider private properties even for a same-color operation', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    expect((await PUT(request('PUT', choice('11')), params())).status).toBe(
      200
    );
    const operation = f.operation()!;
    expect(
      f.patch.mock.calls[0]?.[0].requestBody.extendedProperties.private
    ).toEqual({
      keep: 'private-fixture',
      tuturuuuColorOperation: operation.id,
    });
    expect(operation.phase).toBe('applied');
    expect(operation.prepared?.baseETag).toBe('opaque:original');
  });
  it('refuses recovery after permission loss without another provider attempt', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    await PUT(request('PUT', choice('7')), params());
    const operationId = f.operation()!.id;
    const attempts = f.patch.mock.calls.length;
    f.permission(false);
    expect(
      (await RECOVER(request('POST', { operationId }), params())).status
    ).toBe(403);
    expect(f.patch).toHaveBeenCalledTimes(attempts);
  });
  it('refuses recovery after event relinking without another provider attempt', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPatch(true);
    await PUT(request('PUT', choice('7')), params());
    const operationId = f.operation()!.id;
    const attempts = f.patch.mock.calls.length;
    f.event.external_event_id = 'another-provider-event';
    expect(
      (await RECOVER(request('POST', { operationId }), params())).status
    ).toBe(409);
    expect(f.patch).toHaveBeenCalledTimes(attempts);
  });

  it('settles external 412 from authoritative provider state instead of color equality', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    const delayed = f.delayPatch();
    const pending = PUT(request('PUT', choice('7')), params());
    await delayed.entered.promise;
    f.externalProviderUpdate('7');
    delayed.release.release();
    expect((await pending).status).toBe(409);
    expect(f.operation()?.phase).toBe('superseded');
    expect(f.providerColor()).toBe('7');
    expect(f.event.scheduling_metadata.google_color).toMatchObject({
      color_id: '7',
    });
  });
  it('keeps a post-dispatch palette read failure pending with its recovery ID', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    f.failPaletteAfterPatch(true);
    const response = await PUT(request('PUT', choice('7')), params());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.operationId).toBe(f.operation()?.id);
    expect(JSON.stringify(body)).not.toContain('fixture-private');
    expect(f.providerColor()).toBe('7');
    expect(f.operation()?.phase).toBe('dispatched');
    f.failPaletteAfterPatch(false);
    expect(
      (
        await RECOVER(
          request('POST', { operationId: body.operationId }),
          params()
        )
      ).status
    ).toBe(200);
  });
  it('accepts canonical native color through the same recoverable provider protocol', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    expect((await PUT(request('PUT', { color: 'RED' }), params())).status).toBe(
      200
    );
    expect(f.providerColor()).toBe('11');
    expect(f.event.color).toBe('RED');
  });
  it('persists inherited intent and clears explicit fields under the provider fence', async () => {
    const f = m.fixture as ReturnType<typeof recoverableColorRouteFixture>;
    const response = await PUT(
      request('PUT', {
        providerColor: { connectionId: f.ids.connection, kind: 'inherit' },
      }),
      params()
    );
    expect(response.status).toBe(200);
    expect(f.patch.mock.calls[0]?.[0].requestBody).toMatchObject({
      colorId: '',
      eventLabelId: '',
    });
    expect(f.event.scheduling_metadata.google_color).toMatchObject({
      inherited: true,
      calendar_id: 'selected',
    });
  });
  it('keeps recovery unavailable when the candidate mode is disabled', async () => {
    vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'false');
    expect((await STATUS(request('GET'), params())).status).toBe(404);
    expect(m.fixture.rpc.mock.calls.map(([name]: [string]) => name)).toEqual([
      'calendar_retained_generation',
    ]);
  });
});
