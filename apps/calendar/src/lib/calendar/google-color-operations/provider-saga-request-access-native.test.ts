import { expect, it, vi } from 'vitest';
import type {
  ProviderSagaAdapter,
  SagaBinding,
} from './provider-saga-protocol';
import { createRequestProviderSagaService } from './provider-saga-request-service';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), key: vi.fn() }));
vi.mock('../../calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: mocks.key }));
const ws = '00000000-0000-4000-8000-000000008711';
const eventId = '00000000-0000-4000-8000-000000008741';
const actor = '00000000-0000-4000-8000-000000008701';
const primary = '00000000-0000-4000-8000-000000008791';
const custom = '00000000-0000-4000-8000-000000008792';
const foreign = '00000000-0000-4000-8000-000000008793';
const id = '00000000-0000-4000-8000-000000008751';
const destination: SagaBinding['destination'] = {
  provider: 'google',
  workspaceCalendarId: null,
  identity: {
    wsId: ws,
    eventId,
    connectionId: '00000000-0000-4000-8000-000000008732',
    authTokenId: '00000000-0000-4000-8000-000000008721',
    calendarId: 'destination',
    providerEventId: null,
  },
};
function fixture(disabled = false) {
  vi.clearAllMocks();
  mocks.key.mockResolvedValue(Buffer.alloc(32, 8));
  const event = {
    id: eventId,
    ws_id: ws,
    provider: 'tuturuuu',
    source_calendar_id: null,
    title: 'encrypted-native',
  };
  const rows: Record<string, Array<Record<string, unknown>>> = {
    workspace_calendar_events: [event],
    workspace_calendars: [
      {
        id: primary,
        ws_id: ws,
        calendar_type: 'primary',
        is_enabled: !disabled,
        name: 'Primary',
      },
      {
        id: custom,
        ws_id: ws,
        calendar_type: 'custom',
        is_enabled: true,
        name: 'Custom',
      },
      {
        id: foreign,
        ws_id: '00000000-0000-4000-8000-000000008712',
        calendar_type: 'primary',
        is_enabled: true,
        name: 'Foreign',
      },
    ],
    calendar_auth_tokens: [
      {
        id:
          destination.provider === 'google'
            ? destination.identity.authTokenId
            : '',
        ws_id: ws,
        user_id: actor,
        provider: 'google',
        is_active: true,
        access_token: 'synthetic-token',
      },
    ],
    calendar_connections: [
      {
        id:
          destination.provider === 'google'
            ? destination.identity.connectionId
            : '',
        ws_id: ws,
        provider: 'google',
        calendar_id: 'destination',
        calendar_name: 'Destination',
        is_enabled: true,
        workspace_calendar_id: null,
        auth_token_id: '00000000-0000-4000-8000-000000008721',
        access_role: 'writer',
      },
    ],
  };
  const queried: Array<{ table: string; key: string; value: unknown }> = [];
  const from = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const data = () =>
      (rows[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        queried.push({ table, key, value });
        filters.push((row) => row[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      },
      order: () => query,
      maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders intentionally implement awaitable thenables.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: data(), error: null }).then(resolve),
    };
    return query;
  };
  const rpc = vi.fn(
    async (
      _name: string,
      args: { p_action: string; p_input: Record<string, any> }
    ) => {
      if (args.p_action === 'lookup' || args.p_action === 'read')
        return { data: null, error: null };
      if (args.p_action === 'inspect')
        return { data: { generation: '0', operation: null }, error: null };
      if (args.p_action === 'admit')
        return {
          data: {
            id: args.p_input.id,
            generation: '1',
            phase: 'prepared',
            prepared: args.p_input.prepared,
            checkpoint: null,
          },
          error: null,
        };
      throw new Error('Unexpected fixture RPC');
    }
  );
  const admin = { from, schema: () => ({ from }), rpc };
  mocks.authorize.mockResolvedValue({
    wsId: ws,
    userId: actor,
    sbAdmin: admin,
  });
  const provider = {
    observe: vi.fn(),
    insert: vi.fn(),
  } as unknown as ProviderSagaAdapter;
  return { event, rpc, queried, provider };
}
async function reserve(
  f: ReturnType<typeof fixture>,
  calendarId = primary,
  sourceWs = ws
) {
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    ws,
    eventId,
    {
      provider: () => f.provider,
      project: async () => ({}),
    }
  );
  return service.reserve({
    operationId: id,
    binding: {
      action: 'move',
      mode: 'insert',
      source: {
        provider: 'tuturuuu',
        wsId: sourceWs,
        eventId,
        workspaceCalendarId: calendarId,
      },
      destination,
    },
    payload: {
      event: { summary: 'Synthetic' },
      localPatch: {},
      sendUpdates: 'none',
    },
    nativeSnapshot: f.event,
  });
}
it('actual request service admits a NULL-source native row through its verified primary before any provider work', async () => {
  const f = fixture();
  await expect(reserve(f)).resolves.toMatchObject({ phase: 'prepared' });
  expect(f.rpc.mock.calls.map(([, args]) => args.p_action)).toEqual([
    'lookup',
    'inspect',
    'admit',
  ]);
  expect(f.queried).toContainEqual({
    table: 'workspace_calendars',
    key: 'calendar_type',
    value: 'primary',
  });
  expect(f.queried).toContainEqual({
    table: 'workspace_calendars',
    key: 'ws_id',
    value: ws,
  });
  expect(f.queried).toContainEqual({
    table: 'calendar_auth_tokens',
    key: 'user_id',
    value: actor,
  });
  expect(f.rpc.mock.calls.at(-1)?.[1].p_input.nativeSnapshot).toEqual(f.event);
  expect(mocks.key).toHaveBeenCalledOnce();
  expect(f.provider.observe).not.toHaveBeenCalled();
  expect(f.provider.insert).not.toHaveBeenCalled();
});
it.each([
  { calendar: custom },
  { calendar: foreign },
  { calendar: primary, sourceWs: '00000000-0000-4000-8000-000000008712' },
  { calendar: primary, disabled: true },
])(
  'rejects noncanonical or unavailable native primary %j before inspection or encryption',
  async ({ calendar, sourceWs, disabled }) => {
    const f = fixture(disabled);
    await expect(reserve(f, calendar, sourceWs)).rejects.toMatchObject(
      sourceWs ? { name: 'ZodError' } : { reason: 'identity' }
    );
    expect(f.rpc.mock.calls.map(([, args]) => args.p_action)).not.toContain(
      'inspect'
    );
    expect(f.rpc.mock.calls.map(([, args]) => args.p_action)).not.toContain(
      'admit'
    );
    expect(mocks.key).not.toHaveBeenCalled();
    expect(f.provider.observe).not.toHaveBeenCalled();
    expect(f.provider.insert).not.toHaveBeenCalled();
  }
);
