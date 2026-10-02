import { vi } from 'vitest';
import type { ColorOperation } from '../google-color-operations/protocol';

export const routeFixtureIds = {
  ws: '00000000-0000-4000-8000-000000009811',
  event: '00000000-0000-4000-8000-000000009821',
  connection: '00000000-0000-4000-8000-000000009831',
  token: '00000000-0000-4000-8000-000000009841',
};
export function controlledBarrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const copy = <T>(value: T): T => structuredClone(value);

/** Shared atomic storage boundary double for actual route/service/SDK-adapter
 * tests across independent request instances. SQL invariants need separate DB proof. */
export function recoverableColorRouteFixture() {
  const ids = routeFixtureIds;
  const identity = {
    wsId: ids.ws,
    eventId: ids.event,
    connectionId: ids.connection,
    authTokenId: ids.token,
    calendarId: 'selected',
    providerEventId: 'provider-event',
  };
  let operation: ColorOperation | null = null;
  let generation = '0';
  let etag = 'opaque:original';
  let marker: string | null = null;
  let googleColor = '11';
  let failFinalize = false;
  let failPatch = false;
  let failPaletteAfterPatch = false;
  let tokenActive = true;
  let permission = true;
  let delay: {
    entered: ReturnType<typeof controlledBarrier>;
    release: ReturnType<typeof controlledBarrier>;
  } | null = null;
  const event = {
    id: ids.event,
    ws_id: ids.ws,
    provider: 'google',
    title: 'ciphertext-fixture',
    description: 'ciphertext-fixture',
    location: 'ciphertext-fixture',
    is_encrypted: true,
    external_calendar_id: 'selected',
    external_event_id: 'provider-event',
    google_calendar_id: 'selected',
    google_event_id: 'provider-event',
    source_calendar_id: null,
    color: 'RED',
    scheduling_metadata: { custom: { keep: true } } as Record<string, unknown>,
  };
  const source = {
    provider: 'google',
    connectionId: ids.connection,
    externalCalendarId: 'selected',
    workspaceCalendarId: null,
    accessRole: 'writer',
    accountEmail: null,
    accountName: null,
    label: 'Fixture',
    color: '#ff0000',
    accessToken: 'fixture-access',
    refreshToken: null,
  };
  const rowWrites = vi.fn();
  const rpc = vi.fn(
    async (
      _name: string,
      args: {
        p_action: string;
        p_input: Record<string, any>;
        p_actor_id: string;
      }
    ) => {
      const input = args.p_input;
      const error = (code = '40001') => ({
        data: null,
        error: { code, message: 'fixture-private' },
      });
      if (!tokenActive) return error('42501');
      if (args.p_action === 'inspect')
        return {
          data: { generation, operation: copy(operation) },
          error: null,
        };
      if (args.p_action === 'reserve') {
        if (
          input.generation !== generation ||
          (operation &&
            ['reserved', 'prepared', 'dispatched'].includes(operation.phase))
        )
          return error();
        generation = String(Number(generation) + 1);
        operation = {
          id: input.id,
          generation,
          identity,
          requestHash: input.requestHash,
          intent: input.intent,
          phase: 'reserved',
          prepared: null,
        };
        return { data: copy(operation), error: null };
      }
      if (!operation || input.id !== operation.id) return error();
      if (args.p_action === 'read')
        return { data: copy(operation), error: null };
      if (input.generation !== operation.generation) return error();
      if (args.p_action === 'prepare') {
        if (operation.phase === 'reserved') {
          operation.prepared = copy(input.prepared);
          operation.phase = 'prepared';
        } else if (!operation.prepared) return error();
      } else if (args.p_action === 'dispatch') {
        if (!['prepared', 'dispatched'].includes(operation.phase))
          return error();
        operation.phase = 'dispatched';
      } else if (args.p_action === 'cancel') {
        if (!['reserved', 'prepared'].includes(operation.phase)) return error();
        operation.phase = 'canceled';
      } else if (args.p_action === 'finalize') {
        if (failFinalize) return error('XX000');
        if (!['applied', 'superseded'].includes(operation.phase)) {
          event.color = input.snapshot.compatibilityColor;
          event.scheduling_metadata = {
            ...event.scheduling_metadata,
            ...input.snapshot.metadata,
          };
          operation.phase = input.outcome;
        }
      }
      return { data: copy(operation), error: null };
    }
  );
  const admin = {
    rpc,
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (payload: unknown) => {
          rowWrites(payload);
          return chain;
        },
        delete: () => {
          rowWrites('delete');
          return chain;
        },
        single: async () => ({ data: copy(event), error: null }),
        maybeSingle: async () => ({
          data:
            table === 'workspace_calendar_events'
              ? copy(event)
              : table === 'calendar_connections'
                ? { auth_token_id: ids.token }
                : tokenActive
                  ? {
                      id: ids.token,
                      access_token: 'fixture-access',
                      refresh_token: null,
                    }
                  : null,
          error: null,
        }),
      };
      return chain;
    },
  };
  const get = vi.fn(async () => ({
    data: {
      id: identity.providerEventId,
      etag,
      colorId: googleColor,
      extendedProperties: {
        private: {
          keep: 'private-fixture',
          ...(marker ? { tuturuuuColorOperation: marker } : {}),
        },
      },
    },
  }));
  const patch = vi.fn(
    async (
      args: { requestBody: Record<string, any> },
      options: { headers: { 'If-Match': string } }
    ) => {
      const waiting = delay;
      delay = null;
      if (waiting) {
        waiting.entered.release();
        await waiting.release.promise;
      }
      if (failPatch) throw new Error('fixture-private-provider');
      if (options.headers['If-Match'] !== etag)
        throw { response: { status: 412 } };
      googleColor = args.requestBody.colorId;
      marker =
        args.requestBody.extendedProperties.private.tuturuuuColorOperation;
      etag = `opaque:${marker}`;
      return { data: {} };
    }
  );
  const calendar = {
    events: { get, patch },
    colors: {
      get: async () => {
        if (failPaletteAfterPatch && marker)
          throw new Error('fixture-private-palette');
        return {
          data: {
            event: {
              '11': { background: '#ff0000', foreground: '#ffffff' },
              '7': { background: '#039be5', foreground: '#ffffff' },
            },
          },
        };
      },
    },
    calendarList: {
      get: async () => ({
        data: {
          backgroundColor: '#F691B2',
          foregroundColor: '#000000',
          accessRole: 'writer',
        },
      }),
    },
    calendars: { get: async () => ({ data: {} }) },
  };
  return {
    ids,
    identity,
    source,
    admin,
    calendar,
    event,
    rpc,
    rowWrites,
    get,
    patch,
    authorize: async () =>
      permission
        ? { sbAdmin: admin, wsId: ids.ws, userId: 'actor' }
        : { error: Response.json({ error: 'Denied' }, { status: 403 }) },
    operation: () => copy(operation),
    providerColor: () => googleColor,
    externalProviderUpdate(color: string) {
      googleColor = color;
      marker = null;
      etag = 'opaque:external';
    },
    failPaletteAfterPatch(value: boolean) {
      failPaletteAfterPatch = value;
    },
    concurrentMetadata: () => {
      event.scheduling_metadata.concurrent = { keep: true };
    },
    failFinalize: (value: boolean) => {
      failFinalize = value;
    },
    failPatch: (value: boolean) => {
      failPatch = value;
    },
    tokenActive: (value: boolean) => {
      tokenActive = value;
    },
    permission: (value: boolean) => {
      permission = value;
    },
    delayPatch() {
      delay = { entered: controlledBarrier(), release: controlledBarrier() };
      return delay;
    },
  };
}
