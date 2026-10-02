import type { calendar_v3 } from '@tuturuuu/google';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviderSagaAdapter } from './provider-saga-adapter';
import {
  SAGA_OPERATION_MARKER,
  type SagaBinding,
  sagaGoogleEventId,
} from './provider-saga-protocol';

const operationId = '11111111-1111-4111-8111-111111111111';
const scope = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
};
const targetId = sagaGoogleEventId(operationId);
const destination = {
  provider: 'google' as const,
  workspaceCalendarId: null,
  identity: { ...scope, calendarId: 'destination', providerEventId: targetId },
};
const source = {
  provider: 'google' as const,
  workspaceCalendarId: null,
  identity: { ...scope, calendarId: 'source', providerEventId: 'original' },
};
const create: SagaBinding = {
  operationId,
  generation: '1',
  action: 'create',
  mode: 'insert',
  source: null,
  destination,
  baseETag: null,
};
const transfer: SagaBinding = {
  ...create,
  action: 'move',
  mode: 'copy-delete',
  source,
  baseETag: 'original-etag',
};
const payload = {
  event: {
    summary: 'Edited title',
    description: 'Retained description',
    attendees: [{ email: 'synthetic@example.invalid' }],
    extendedProperties: {
      private: { preserved: 'value' },
      shared: { preserved: 'shared' },
    },
  },
  localPatch: {},
  sendUpdates: 'all' as const,
};
const events = new Map<string, calendar_v3.Schema$Event>();
const allowed = vi.fn();
const list = vi.fn();
const get = vi.fn();
const insert = vi.fn();
const remove = vi.fn();
const move = vi.fn();
const resolve = vi.fn();
const calendar = {
  calendarList: { get: list },
  events: { get, insert, delete: remove, move },
} as unknown as calendar_v3.Calendar;
function adapter(enabled = true) {
  return createProviderSagaAdapter({
    access: { assertAllowed: allowed },
    resolveGoogle: resolve,
    capabilities: enabled
      ? { googleInsert: true, googleConditionalDelete: true }
      : undefined,
  });
}
function target(etag = 'target-etag', marker = operationId) {
  return {
    id: targetId,
    etag,
    extendedProperties: { private: { [SAGA_OPERATION_MARKER]: marker } },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  events.clear();
  allowed.mockResolvedValue(undefined);
  resolve.mockResolvedValue(calendar);
  list.mockImplementation(async ({ calendarId }) => ({
    data: { id: calendarId, accessRole: 'writer' },
  }));
  get.mockImplementation(async ({ calendarId, eventId }) => {
    const data = events.get(`${calendarId}/${eventId}`);
    if (!data) throw { response: { status: 404 } };
    return { data };
  });
  insert.mockImplementation(async ({ calendarId, requestBody }) => {
    events.set(`${calendarId}/${requestBody.id}`, {
      ...requestBody,
      etag: 'created-etag',
    });
    return { data: { id: requestBody.id } };
  });
  remove.mockImplementation(async ({ calendarId, eventId }) => {
    events.delete(`${calendarId}/${eventId}`);
    return {};
  });
});
describe('disabled provider saga SDK adapter', () => {
  it('defaults all mutations to unavailable without a provider call', async () => {
    const provider = adapter(false);
    await expect(provider.insert(create, payload)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    await expect(
      provider.deleteSource(transfer, payload)
    ).rejects.toMatchObject({ reason: 'unavailable' });
    await expect(provider.move(transfer, payload)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('keeps Google move and Microsoft paths hard unavailable', async () => {
    const atomic: SagaBinding = {
      ...transfer,
      mode: 'google-move',
      destination: {
        ...destination,
        identity: { ...destination.identity, providerEventId: 'original' },
      },
    };
    await expect(adapter().move(atomic, payload)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    const graph: SagaBinding = {
      ...create,
      destination: {
        ...destination,
        provider: 'microsoft',
        identity: { ...destination.identity, providerEventId: null },
      },
    };
    await expect(adapter().insert(graph, payload)).rejects.toMatchObject({
      reason: 'unavailable',
    });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('inserts deterministic ID/private marker without losing sealed edited content', async () => {
    const result = await adapter().insert(create, payload);
    expect(result).toMatchObject({
      absent: false,
      eventId: targetId,
      marker: operationId,
    });
    expect(insert).toHaveBeenCalledWith({
      calendarId: 'destination',
      sendUpdates: 'all',
      requestBody: {
        ...payload.event,
        id: targetId,
        extendedProperties: {
          shared: { preserved: 'shared' },
          private: { preserved: 'value', [SAGA_OPERATION_MARKER]: operationId },
        },
      },
    });
    // Calendar-list reads, event reads and mutation each resolve separately.
    expect(resolve).toHaveBeenCalledTimes(
      list.mock.calls.length + get.mock.calls.length + insert.mock.calls.length
    );
    expect(allowed).toHaveBeenCalledTimes(resolve.mock.calls.length);
  });
  it.each([0, 1] as const)(
    'keeps sealed event label version %s in the SDK query, not the event body',
    async (eventLabelVersion) => {
      await adapter().insert(create, { ...payload, eventLabelVersion });
      const call = insert.mock.calls[0]?.[0];
      expect(call.eventLabelVersion).toBe(eventLabelVersion);
      expect(call.requestBody).not.toHaveProperty('eventLabelVersion');
    }
  );
  it('recovers an ambiguous successful insert by observing its marker, without repeat dispatch', async () => {
    insert.mockImplementationOnce(async () => {
      events.set(`destination/${targetId}`, target());
      throw new Error('Synthetic private transport diagnostics');
    });
    expect(await adapter().insert(create, payload)).toMatchObject({
      absent: false,
      marker: operationId,
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it('does not repeat an insert whose outcome remains absent', async () => {
    insert.mockRejectedValueOnce(new Error('Synthetic secret must not escape'));
    await expect(adapter().insert(create, payload)).rejects.toMatchObject({
      reason: 'unavailable',
      message: 'Provider saga operation unavailable',
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it('replay adopts only the same deterministic ID and operation marker', async () => {
    events.set(`destination/${targetId}`, target());
    expect(await adapter().insert(create, payload)).toMatchObject({
      absent: false,
    });
    expect(insert).not.toHaveBeenCalled();
    events.set(`destination/${targetId}`, target('etag', 'foreign-operation'));
    await expect(adapter().insert(create, payload)).rejects.toMatchObject({
      reason: 'identity',
    });
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([403, 404])(
    'does not mistake a denied calendar for missing event (%s)',
    async (status) => {
      list.mockRejectedValueOnce({ response: { status } });
      await expect(
        adapter().observe(create, destination)
      ).rejects.toMatchObject({ reason: 'unauthorized' });
      expect(get).not.toHaveBeenCalled();
    }
  );
  it('requires live writable permission before observing absence', async () => {
    list.mockResolvedValueOnce({
      data: { id: 'destination', accessRole: 'reader' },
    });
    await expect(adapter().observe(create, destination)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    expect(get).not.toHaveBeenCalled();
    expect(await adapter().observe(create, destination)).toEqual({
      absent: true,
    });
  });
  it('rejects event and endpoint overrides before provider access', async () => {
    await expect(
      adapter().observe(create, destination, 'foreign')
    ).rejects.toMatchObject({ reason: 'identity' });
    await expect(
      adapter().observe(create, {
        ...destination,
        identity: { ...destination.identity, calendarId: 'foreign' },
      })
    ).rejects.toMatchObject({ reason: 'identity' });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rechecks revocation between observation and insert', async () => {
    allowed
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(adapter().insert(create, payload)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it('deletes with original source ETag and sealed notification intent', async () => {
    await adapter().deleteSource(transfer, payload);
    expect(remove).toHaveBeenCalledWith(
      { calendarId: 'source', eventId: 'original', sendUpdates: 'all' },
      { headers: { 'If-Match': 'original-etag' } }
    );
  });
  it('retains a source412 conflict and never adopts its changed ETag', async () => {
    remove.mockRejectedValueOnce({ response: { status: 412 } });
    await expect(
      adapter().deleteSource(transfer, payload)
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });
  it('confirms an ambiguous successful delete using fresh authorized absence', async () => {
    remove.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(
      adapter().deleteSource(transfer, payload)
    ).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('compensates only the captured target version, with intentional no notification', async () => {
    events.set(`destination/${targetId}`, target());
    await adapter().removeTarget(transfer, {
      step: 'target-created',
      targetEventId: targetId,
      targetETag: 'target-etag',
    });
    expect(remove).toHaveBeenCalledWith(
      { calendarId: 'destination', eventId: targetId, sendUpdates: 'none' },
      { headers: { 'If-Match': 'target-etag' } }
    );
  });
  it('rejects changed target version or marker before compensation', async () => {
    events.set(`destination/${targetId}`, target('changed-etag'));
    await expect(
      adapter().removeTarget(transfer, {
        step: 'target-created',
        targetEventId: targetId,
        targetETag: 'target-etag',
      })
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(remove).not.toHaveBeenCalled();
    events.set(
      `destination/${targetId}`,
      target('target-etag', 'foreign-operation')
    );
    await expect(
      adapter().removeTarget(transfer, {
        step: 'target-created',
        targetEventId: targetId,
        targetETag: 'target-etag',
      })
    ).rejects.toMatchObject({ reason: 'identity' });
    expect(remove).not.toHaveBeenCalled();
  });
});

const atomic: SagaBinding = {
  ...transfer,
  mode: 'google-move',
  destination: {
    ...destination,
    identity: { ...destination.identity, providerEventId: 'original' },
  },
};
const movePayload = {
  event: {},
  localPatch: {},
  sendUpdates: 'none' as const,
  sourceICalUID: 'sealed-source-uid',
};
function movingAdapter() {
  return createProviderSagaAdapter({
    access: { assertAllowed: allowed },
    resolveGoogle: resolve,
    capabilities: { googleMove: true },
  });
}
function sourceEvent(etag = 'original-etag') {
  return { id: 'original', etag, iCalUID: 'sealed-source-uid' };
}
describe('conditionally fenced same-account Google move', () => {
  beforeEach(() => {
    events.set('source/original', sourceEvent());
    move.mockImplementation(async () => {
      events.delete('source/original');
      events.set('destination/original', { ...sourceEvent('moved-etag') });
      return {};
    });
  });
  it('moves only original version and sealed notification intent, then confirms both endpoints', async () => {
    expect(await movingAdapter().move(atomic, movePayload)).toMatchObject({
      absent: false,
      eventId: 'original',
      etag: 'moved-etag',
    });
    expect(move).toHaveBeenCalledWith(
      {
        calendarId: 'source',
        eventId: 'original',
        destination: 'destination',
        sendUpdates: 'none',
      },
      { headers: { 'If-Match': 'original-etag' } }
    );
    expect(resolve.mock.calls.length).toBe(
      list.mock.calls.length + get.mock.calls.length + move.mock.calls.length
    );
  });
  it('recovers lost success and repeated execution without dispatching another move', async () => {
    move.mockImplementationOnce(async () => {
      events.delete('source/original');
      events.set('destination/original', sourceEvent('moved-etag'));
      throw new Error('private transport details');
    });
    await movingAdapter().move(atomic, movePayload);
    await movingAdapter().move(atomic, movePayload);
    expect(move).toHaveBeenCalledTimes(1);
  });
  it('never adopts independently created destination ID with a different UID', async () => {
    events.delete('source/original');
    events.set('destination/original', {
      ...sourceEvent(),
      iCalUID: 'unrelated-uid',
    });
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({ reason: 'identity' });
    expect(move).not.toHaveBeenCalled();
  });
  it('rejects a destination collision even with matching UID while source still exists', async () => {
    events.set('destination/original', sourceEvent());
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(move).not.toHaveBeenCalled();
  });
  it('keeps ambiguous absent destination pending without repeating a mutation', async () => {
    move.mockRejectedValueOnce(new Error('private diagnostics'));
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({
      reason: 'unavailable',
      message: 'Provider saga operation unavailable',
    });
    expect(move).toHaveBeenCalledTimes(1);
  });
  it('does not replace original ETag after provider conflict', async () => {
    move.mockImplementationOnce(async () => {
      events.set('source/original', sourceEvent('changed-etag'));
      throw { response: { status: 412 } };
    });
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({ reason: 'conflict' });
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({ reason: 'conflict' });
    expect(move).toHaveBeenCalledTimes(1);
  });
  it('rejects edited content or missing fingerprint before provider access', async () => {
    await expect(
      movingAdapter().move(atomic, {
        ...movePayload,
        event: { summary: 'edit' },
      })
    ).rejects.toMatchObject({ reason: 'unavailable' });
    await expect(
      movingAdapter().move(atomic, { ...movePayload, sourceICalUID: undefined })
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rejects an authoritative calendar-scoped label before any move effects', async () => {
    const original = { ...sourceEvent(), eventLabelId: 'source-label' };
    events.set('source/original', original);
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(move).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(events.get('source/original')).toEqual(original);
    expect(events.has('destination/original')).toBe(false);
  });
  it('refuses attendee notifications pending acceptance and rechecks actor revocation before dispatch', async () => {
    events.set('source/original', {
      ...sourceEvent(),
      attendees: [{ email: 'synthetic@example.invalid' }],
    });
    await expect(
      movingAdapter().move(atomic, movePayload)
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(move).not.toHaveBeenCalled();
    events.set('source/original', sourceEvent());
    allowed
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await expect(movingAdapter().move(atomic, movePayload)).rejects.toThrow();
    expect(move).not.toHaveBeenCalled();
  });
});
