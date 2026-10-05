import { createHash } from 'node:crypto';
import type { calendar_v3 } from '@tuturuuu/google';
import type { createGraphClient } from '@tuturuuu/microsoft';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedCalendarSource } from '../../source-resolver';
import { googleSeriesPayload, type ProviderSeriesSnapshot } from './payload';
import {
  type ProviderSeriesPlan,
  providerSeriesCreatePlan,
  providerSeriesMutationPlan,
} from './plan';
import { createSeriesProviderWriter } from './writer';

vi.mock('../../provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));
const source: Extract<
  ResolvedCalendarSource,
  { provider: 'google' | 'microsoft' }
> = {
  provider: 'google',
  connectionId: 'connection',
  externalCalendarId: 'calendar',
  workspaceCalendarId: null,
  accessRole: 'owner',
  accountEmail: null,
  accountName: null,
  label: 'Fixture',
  color: null,
  accessToken: 'fixture-not-a-token',
};
const snapshot: ProviderSeriesSnapshot = {
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'America/New_York',
    end: { type: 'count', count: 4 },
  },
  anchor: {
    startLocal: '2026-03-06T09:00:00',
    endLocal: '2026-03-06T10:00:00',
    allDay: false,
  },
  event: { title: 'Fixture' },
};
const binding = {
  provider: 'google' as const,
  connectionId: 'connection',
  calendarId: 'calendar',
  masterId: 'master',
  etag: 'v1',
};
const plan = (
  action: 'update' | 'delete' = 'update',
  scope: 'this' | 'all' | 'future' = 'all'
) =>
  providerSeriesMutationPlan({
    operationId: 'operation',
    binding,
    current: snapshot,
    action,
    scope,
    originalStartLocal: '2026-03-08T09:00:00',
  });
function googleWriter() {
  const events = {
    insert: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  const writer = createSeriesProviderWriter({
    source,
    authorize: vi.fn(),
    googleApi: { events } as unknown as calendar_v3.Calendar,
  });
  return { events, writer };
}
function graphWriter(responses: unknown[]) {
  const calls: {
    path: string;
    headers: Record<string, string>;
    method?: string;
    body?: unknown;
  }[] = [];
  const client = {
    api(path: string) {
      const call = { path, headers: {} } as (typeof calls)[number];
      calls.push(call);
      const run = async (method: string, body?: unknown) => {
        call.method = method;
        call.body = body;
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      };
      const request = {
        header(name: string, value: string) {
          call.headers[name] = value;
          return request;
        },
        query(_query: unknown) {
          return request;
        },
        get: () => run('GET'),
        post: (body: unknown) => run('POST', body),
        patch: (body: unknown) => run('PATCH', body),
        delete: () => run('DELETE'),
      };
      return request;
    },
  } as unknown as ReturnType<typeof createGraphClient>;
  const writer = createSeriesProviderWriter({
    source: { ...source, provider: 'microsoft', externalCalendarId: 'cal/+?' },
    authorize: vi.fn(),
    graphApi: client,
  });
  return { writer, calls };
}
const conflict = Object.assign(new Error('conflict'), { code: 409 });

describe('future series metadata preservation', () => {
  it('keeps safe Google metadata while replacing only the private operation marker', async () => {
    const f = googleWriter();
    const value = plan('update', 'future');
    const step = value.steps[1]!;
    if (step.kind !== 'create') throw new Error('Missing create');
    step.metadata = {
      provider: 'google',
      fields: {
        attendees: [{ email: 'guest@example.invalid', optional: true }],
        attachments: [
          {
            fileUrl: 'https://drive.google.com/file/d/fixture',
            title: 'Fixture document',
          },
        ],
        visibility: 'private',
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 5 }],
        },
        extendedProperties: {
          private: { custom: 'retained' },
          shared: { code: 'fixture' },
        },
      },
    };
    f.events.insert.mockResolvedValue({
      data: { id: step.key, etag: 'created' },
    });
    await f.writer.apply(value, step, []);
    expect(f.events.insert.mock.calls[0]?.[0].supportsAttachments).toBe(true);
    expect(f.events.insert.mock.calls[0]?.[0].requestBody).toMatchObject({
      attendees: step.metadata.fields.attendees,
      attachments: step.metadata.fields.attachments,
      visibility: 'private',
      reminders: step.metadata.fields.reminders,
      extendedProperties: {
        private: {
          custom: 'retained',
          tuturuuu_series_intent: expect.any(String),
        },
        shared: { code: 'fixture' },
      },
    });
  });
  it('preserves Outlook HTML body and safe guest/reminder fields on create', async () => {
    const f = graphWriter([
      { value: [] },
      { value: [{ alias: 'America/New_York' }] },
      { id: 'new', '@odata.etag': 'v1' },
    ]);
    const value = providerSeriesCreatePlan('operation', {
      ...snapshot,
      event: { title: 'Fixture', description: '<p>Fixture</p>' },
    });
    const step = value.steps[0]!;
    if (step.kind !== 'create') throw new Error('Missing create');
    step.metadata = {
      provider: 'microsoft',
      fields: {
        body: { contentType: 'html', content: '<p>Fixture</p>' },
        attendees: [
          {
            type: 'required',
            emailAddress: { address: 'guest@example.invalid' },
          },
        ],
        sensitivity: 'private',
        isReminderOn: true,
        reminderMinutesBeforeStart: 15,
      },
    };
    await f.writer.apply(value, step, []);
    expect(f.calls[2]?.body).toMatchObject({
      body: { contentType: 'html', content: '<p>Fixture</p>' },
      attendees: step.metadata.fields.attendees,
      sensitivity: 'private',
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
    });
  });
  it('refuses cross-provider create metadata before sending any remote write', async () => {
    const f = googleWriter();
    const value = plan('update', 'future');
    const step = value.steps[1]!;
    if (step.kind !== 'create') throw new Error('Missing create');
    step.metadata = {
      provider: 'microsoft',
      fields: { sensitivity: 'private' },
    };
    await expect(f.writer.apply(value, step, [])).rejects.toThrow(
      'metadata source changed'
    );
    expect(f.events.insert).not.toHaveBeenCalled();
  });
});

describe('Google recurrence provider writer', () => {
  it('creates a master with deterministic identity and attendee notifications enabled', async () => {
    const { writer, events } = googleWriter();
    const create = providerSeriesCreatePlan('operation', snapshot);
    const step = create.steps[0]!;
    if (step.kind !== 'create') throw new Error('fixture');
    events.insert.mockResolvedValue({ data: { id: step.key, etag: 'v1' } });
    expect(await writer.apply(create, step, [])).toEqual({
      eventId: step.key,
      etag: 'v1',
    });
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: 'all',
        requestBody: expect.objectContaining({
          recurrence: expect.any(Array),
          id: step.key,
        }),
      })
    );
  });
  it('recovers a lost create response only if the retained request fingerprint matches', async () => {
    const { writer, events } = googleWriter();
    const create = providerSeriesCreatePlan('operation', snapshot);
    const step = create.steps[0]!;
    if (step.kind !== 'create') throw new Error('fixture');
    events.insert.mockRejectedValue(conflict);
    const hash = createHash('sha256')
      .update(JSON.stringify(googleSeriesPayload(snapshot)))
      .digest('hex');
    events.get.mockResolvedValue({
      data: {
        id: step.key,
        etag: 'v1',
        extendedProperties: { private: { tuturuuu_series_intent: hash } },
      },
    });
    await expect(writer.apply(create, step, [])).resolves.toEqual({
      eventId: step.key,
      etag: 'v1',
    });
  });
  it('rejects conflicting deterministic IDs with another create intent', async () => {
    const { writer, events } = googleWriter();
    const create = providerSeriesCreatePlan('operation', snapshot);
    events.insert.mockRejectedValue(conflict);
    events.get.mockResolvedValue({
      data: {
        id: 'other',
        etag: 'v1',
        extendedProperties: { private: { tuturuuu_series_intent: 'other' } },
      },
    });
    await expect(writer.apply(create, create.steps[0]!, [])).rejects.toThrow(
      'identity'
    );
  });
  it('uses provider ETag preconditions when changing the master', async () => {
    const { writer, events } = googleWriter();
    const operation = plan();
    events.get.mockResolvedValue({ data: { id: 'master', etag: 'v1' } });
    events.patch.mockResolvedValue({ data: { id: 'master', etag: 'v2' } });
    await writer.apply(operation, operation.steps[0]!, []);
    expect(events.patch).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'master', sendUpdates: 'all' }),
      { headers: { 'If-Match': 'v1' } }
    );
  });
  it('recovers a patch response loss by comparing provider fields without writing again', async () => {
    const { writer, events } = googleWriter();
    const operation = plan();
    events.get.mockResolvedValue({
      data: { id: 'master', etag: 'v2', ...googleSeriesPayload(snapshot) },
    });
    await expect(
      writer.apply(operation, operation.steps[0]!, [])
    ).resolves.toEqual({ eventId: 'master', etag: 'v2' });
    expect(events.patch).not.toHaveBeenCalled();
  });
  it('refuses an external revision change with divergent fields', async () => {
    const { writer, events } = googleWriter();
    const operation = plan();
    events.get.mockResolvedValue({
      data: { id: 'master', etag: 'v2', summary: 'External edit' },
    });
    await expect(
      writer.apply(operation, operation.steps[0]!, [])
    ).rejects.toThrow('revision');
    expect(events.patch).not.toHaveBeenCalled();
  });
  it('retries a completed delete without another remote effect', async () => {
    const { writer, events } = googleWriter();
    const operation = plan('delete');
    events.get.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 410 })
    );
    await expect(
      writer.apply(operation, operation.steps[0]!, [])
    ).resolves.toEqual({ eventId: 'master', etag: null, deleted: true });
    expect(events.delete).not.toHaveBeenCalled();
  });
  it('never applies an instance edit without a server-resolved original-slot identity', async () => {
    const { writer, events } = googleWriter();
    const operation = plan('update', 'this');
    await expect(
      writer.apply(operation, operation.steps[0]!, [])
    ).rejects.toThrow('Resolved');
    expect(events.get).not.toHaveBeenCalled();
  });
  it('rejects a provider binding from another calendar before any remote effect', async () => {
    const { writer, events } = googleWriter();
    const operation = plan();
    operation.binding!.calendarId = 'another';
    await expect(
      writer.apply(operation, operation.steps[0]!, [])
    ).rejects.toThrow('binding');
    expect(events.get).not.toHaveBeenCalled();
  });
});
describe('Outlook recurrence provider writer', () => {
  it('validates the mailbox timezone and uses transactionId and immutable IDs', async () => {
    const { writer, calls } = graphWriter([
      { value: [] },
      { value: [{ alias: 'America/New_York' }] },
      { id: 'immutable-master', '@odata.etag': 'v1' },
    ]);
    const create = providerSeriesCreatePlan('operation', snapshot);
    expect(await writer.apply(create, create.steps[0]!, [])).toEqual({
      eventId: 'immutable-master',
      etag: 'v1',
    });
    expect(calls[2]).toMatchObject({
      path: '/me/calendars/cal%2F%2B%3F/events',
      headers: { Prefer: 'IdType="ImmutableId"' },
      body: {
        transactionId: 'operation',
        recurrence: { pattern: { type: 'daily' } },
      },
    });
  });
  it('recovers an Outlook create by its persistent operation marker without reposting', async () => {
    const { writer, calls } = graphWriter([
      { value: [{ id: 'retained-master' }] },
      { id: 'retained-master', '@odata.etag': 'v2' },
    ]);
    const create = providerSeriesCreatePlan('operation', snapshot);
    await expect(writer.apply(create, create.steps[0]!, [])).resolves.toEqual({
      eventId: 'retained-master',
      etag: 'v2',
    });
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(calls[1]!.path).toBe(
      '/me/calendars/cal%2F%2B%3F/events/retained-master'
    );
  });
  it.each([
    { value: [{ id: 'one' }, { id: 'two' }] },
    { value: [{ id: 'one' }], '@odata.nextLink': 'more' },
  ])('fails closed for ambiguous create recovery: %j', async (response) => {
    const { writer, calls } = graphWriter([response]);
    const create = providerSeriesCreatePlan('operation', snapshot);
    await expect(writer.apply(create, create.steps[0]!, [])).rejects.toThrow();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });
  it('does not silently substitute UTC for an unsupported mailbox timezone', async () => {
    const { writer, calls } = graphWriter([
      { value: [] },
      { value: [{ alias: 'UTC' }] },
    ]);
    const create = providerSeriesCreatePlan('operation', snapshot);
    await expect(writer.apply(create, create.steps[0]!, [])).rejects.toThrow(
      'timezone'
    );
    expect(calls).toHaveLength(2);
  });
  it('does not accept a provider creation response without its authoritative revision', async () => {
    const { writer } = graphWriter([
      { value: [] },
      { value: [{ alias: 'America/New_York' }] },
      { id: 'master' },
    ]);
    const create = providerSeriesCreatePlan('operation', snapshot);
    await expect(writer.apply(create, create.steps[0]!, [])).rejects.toThrow(
      'receipt'
    );
  });
  it('encodes the external event ID and uses If-Match when deleting', async () => {
    const { writer, calls } = graphWriter([
      { id: 'master/+?', '@odata.etag': 'v1' },
      undefined,
    ]);
    const operation: ProviderSeriesPlan = {
      operationId: 'operation',
      binding: {
        ...binding,
        provider: 'microsoft',
        calendarId: 'cal/+?',
        masterId: 'master/+?',
      },
      steps: [{ kind: 'delete', target: 'master' }],
    };
    await writer.apply(operation, operation.steps[0]!, []);
    expect(calls[1]).toMatchObject({
      path: '/me/calendars/cal%2F%2B%3F/events/master%2F%2B%3F',
      method: 'DELETE',
      headers: { 'If-Match': 'v1' },
    });
  });
});
