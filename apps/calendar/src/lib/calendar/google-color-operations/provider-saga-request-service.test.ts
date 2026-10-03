import { describe, expect, it, vi } from 'vitest';
import { createProviderSagaCodec } from './provider-saga-codec';
import type {
  ProviderSagaAdapter,
  SagaEndpoint,
} from './provider-saga-protocol';
import { createRequestProviderSagaService } from './provider-saga-request-service';

const mocks = vi.hoisted(() => ({
  authorization: vi.fn(),
  assertAllowed: vi.fn(),
  getKey: vi.fn(),
}));
vi.mock('./provider-saga-request-access', () => ({
  createRequestProviderSagaAccess: () => mocks,
}));
vi.mock('../../workspace-encryption', () => ({
  getWorkspaceKey: mocks.getKey,
}));
const scope = {
  wsId: '00000000-0000-4000-8000-000000008711',
  eventId: '00000000-0000-4000-8000-000000008741',
  authTokenId: '00000000-0000-4000-8000-000000008721',
};
const source: SagaEndpoint = {
  provider: 'google',
  workspaceCalendarId: null,
  identity: {
    ...scope,
    connectionId: '00000000-0000-4000-8000-000000008731',
    calendarId: 'old',
    providerEventId: 'original',
  },
};
const destination: SagaEndpoint = {
  provider: 'google',
  workspaceCalendarId: null,
  identity: {
    ...scope,
    connectionId: '00000000-0000-4000-8000-000000008732',
    calendarId: 'new',
    providerEventId: null,
  },
};
function fixture() {
  vi.clearAllMocks();
  mocks.getKey.mockResolvedValue(Buffer.alloc(32, 8));
  const rpc = vi.fn(async (_name, params) =>
    params.p_action === 'lookup'
      ? { data: null, error: null }
      : params.p_action === 'inspect'
        ? {
            data: { generation: '9007199254740993', operation: null },
            error: null,
          }
        : {
            data: {
              id: params.p_input.id,
              generation: params.p_input.prepared.binding.generation,
              phase: 'prepared',
              prepared: params.p_input.prepared,
              checkpoint: null,
            },
            error: null,
          }
  );
  mocks.authorization.mockResolvedValue({
    userId: '00000000-0000-4000-8000-000000008701',
    wsId: scope.wsId,
    sbAdmin: { rpc },
  });
  mocks.assertAllowed.mockResolvedValue(undefined);
  const provider: ProviderSagaAdapter = {
    observe: vi.fn().mockResolvedValue({
      absent: false,
      eventId: 'original',
      etag: 'original-version',
      marker: null,
      event: {},
    }),
    insert: vi.fn(),
    move: vi.fn(),
    deleteSource: vi.fn(),
    removeTarget: vi.fn(),
  };
  return {
    rpc,
    provider,
    input: {
      binding: {
        action: 'move' as const,
        mode: 'copy-delete' as const,
        source,
        destination,
      },
      payload: {
        event: { summary: 'Synthetic sensitive intent' },
        localPatch: {},
        sendUpdates: 'all' as const,
      },
    },
  };
}
describe('request saga preparation and generation admission', () => {
  it('captures source ETag once and preserves bigint generation and deterministic destination ID', async () => {
    const f = fixture();
    const service = await createRequestProviderSagaService(
      new Request('https://example.test'),
      scope.wsId,
      scope.eventId,
      { provider: () => f.provider, project: vi.fn() }
    );
    const operation = await service.reserve(f.input);
    expect(operation.generation).toBe('9007199254740994');
    expect(operation.prepared.binding.baseETag).toBe('original-version');
    expect(JSON.stringify(operation.prepared)).not.toContain(
      'Synthetic sensitive intent'
    );
    expect(operation.prepared.binding.destination).toMatchObject({
      identity: { providerEventId: `tt${operation.id.replaceAll('-', '')}` },
    });
    expect(f.provider.observe).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls[2]?.[1].p_input.expectedGeneration).toBe(
      '9007199254740993'
    );
  });
  it('blocks a pending cross-kind generation before source GET or key lookup', async () => {
    const f = fixture();
    f.rpc
      .mockResolvedValueOnce({ data: null, error: null } as never)
      .mockResolvedValueOnce({
        data: {
          generation: '8',
          operation: {
            id: '00000000-0000-4000-8000-000000008751',
            phase: 'dispatched',
          },
        },
        error: null,
      } as never);
    const service = await createRequestProviderSagaService(
      new Request('https://example.test'),
      scope.wsId,
      scope.eventId,
      { provider: () => f.provider, project: vi.fn() }
    );
    await expect(service.reserve(f.input)).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(f.provider.observe).not.toHaveBeenCalled();
    expect(mocks.getKey).not.toHaveBeenCalled();
  });
  it('does not refresh original provider version when a competing admission wins', async () => {
    const f = fixture();
    f.rpc
      .mockResolvedValueOnce({ data: null, error: null } as never)
      .mockResolvedValueOnce({
        data: { generation: '0', operation: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } } as never);
    const service = await createRequestProviderSagaService(
      new Request('https://example.test'),
      scope.wsId,
      scope.eventId,
      { provider: () => f.provider, project: vi.fn() }
    );
    await expect(service.reserve(f.input)).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(f.provider.observe).toHaveBeenCalledTimes(1);
  });
});

it('reuses exact immutable preparation on lost HTTP response and rejects request ID payload changes', async () => {
  const f = fixture();
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    scope.wsId,
    scope.eventId,
    { provider: () => f.provider, project: vi.fn() }
  );
  const input = {
    ...f.input,
    operationId: '00000000-0000-4000-8000-000000008751',
  };
  const operation = await service.reserve(input);
  f.rpc.mockResolvedValueOnce({
    data: { ...operation, phase: 'applied' },
    error: null,
  } as never);
  expect(await service.reserve(input)).toMatchObject({
    id: operation.id,
    phase: 'applied',
  });
  expect(f.provider.observe).toHaveBeenCalledTimes(1);
  f.rpc.mockResolvedValueOnce({ data: operation, error: null } as never);
  await expect(
    service.reserve({
      ...input,
      payload: { ...input.payload, event: { summary: 'Changed intent' } },
    })
  ).rejects.toMatchObject({ reason: 'conflict' });
  expect(f.provider.observe).toHaveBeenCalledTimes(1);
});

it('captures Google move UID once inside the original encrypted journal and rejects caller override', async () => {
  const f = fixture();
  vi.mocked(f.provider.observe).mockResolvedValue({
    absent: false,
    eventId: 'original',
    etag: 'original-version',
    marker: null,
    event: { iCalUID: 'synthetic-source-uid' },
  });
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    scope.wsId,
    scope.eventId,
    { provider: () => f.provider, project: vi.fn() }
  );
  const input = {
    ...f.input,
    binding: {
      ...f.input.binding,
      mode: 'google-move' as const,
      destination: {
        ...destination,
        identity: {
          ...destination.identity,
          authTokenId: scope.authTokenId,
          providerEventId: 'original',
        },
      },
    },
    payload: { ...f.input.payload, event: {} },
  };
  const operation = await service.reserve(input);
  expect(JSON.stringify(operation.prepared)).not.toContain(
    'synthetic-source-uid'
  );
  await expect(
    service.reserve({
      ...input,
      payload: { ...input.payload, sourceICalUID: 'forged' },
    })
  ).rejects.toMatchObject({ reason: 'identity' });
  expect(f.provider.observe).toHaveBeenCalledTimes(1);
});

it('rejects an authoritative calendar-scoped label move before keys or admission', async () => {
  const f = fixture();
  vi.mocked(f.provider.observe).mockResolvedValueOnce({
    absent: false,
    eventId: 'original',
    etag: 'original-version',
    marker: null,
    event: { iCalUID: 'synthetic-source-uid', eventLabelId: 'source-label' },
  });
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    scope.wsId,
    scope.eventId,
    { provider: () => f.provider, project: vi.fn() }
  );
  await expect(
    service.reserve({
      ...f.input,
      binding: {
        ...f.input.binding,
        mode: 'google-move',
        destination: {
          ...destination,
          identity: { ...destination.identity, providerEventId: 'original' },
        },
      },
      payload: { ...f.input.payload, event: {} },
    })
  ).rejects.toMatchObject({ reason: 'conflict' });
  expect(mocks.getKey).not.toHaveBeenCalled();
  expect(
    f.rpc.mock.calls.some(([, params]) => params.p_action === 'admit')
  ).toBe(false);
  expect(f.provider.move).not.toHaveBeenCalled();
  expect(f.provider.insert).not.toHaveBeenCalled();
  expect(f.provider.deleteSource).not.toHaveBeenCalled();
});

it('rejects attendee-bearing transfer before generation admission', async () => {
  const f = fixture();
  vi.mocked(f.provider.observe).mockResolvedValueOnce({
    absent: false,
    eventId: 'original',
    etag: 'original-version',
    marker: null,
    event: { attendees: [{ email: 'synthetic@example.invalid' }] },
  });
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    scope.wsId,
    scope.eventId,
    { provider: () => f.provider, project: vi.fn() }
  );
  await expect(service.reserve(f.input)).rejects.toMatchObject({
    reason: 'unavailable',
  });
  expect(
    f.rpc.mock.calls.every(([, params]) => params.p_action !== 'admit')
  ).toBe(true);
});

it('captures native destination fields from the same current provider read as the deletion ETag', async () => {
  const f = fixture();
  vi.mocked(f.provider.observe).mockResolvedValueOnce({
    absent: false,
    eventId: 'original',
    etag: 'fresh-original-version',
    marker: null,
    event: {
      id: 'original',
      etag: 'fresh-original-version',
      summary: 'Fresh provider title',
      description: 'Fresh provider description',
      start: { dateTime: '2026-10-02T10:00:00Z' },
      end: { dateTime: '2026-10-02T11:00:00Z' },
    },
  });
  const service = await createRequestProviderSagaService(
    new Request('https://example.test'),
    scope.wsId,
    scope.eventId,
    { provider: () => f.provider, project: vi.fn() }
  );
  const operation = await service.reserve({
    ...f.input,
    binding: {
      ...f.input.binding,
      mode: 'external-to-native',
      destination: {
        provider: 'tuturuuu',
        wsId: scope.wsId,
        eventId: scope.eventId,
        workspaceCalendarId: '00000000-0000-4000-8000-000000008791',
      },
    },
  });
  const sealed = await createProviderSagaCodec({ access: mocks }).open(
    operation.prepared.binding,
    operation.prepared.journal
  );
  expect(sealed.sourceSnapshot).toMatchObject({
    title: 'Fresh provider title',
    description: 'Fresh provider description',
  });
  expect(operation.prepared.binding.baseETag).toBe('fresh-original-version');
  expect(sealed.event).toEqual(f.input.payload.event);
});

it.each([false, true])(
  'passes native snapshot only to atomic admission and performs no provider access (stale=%s)',
  async (stale) => {
    const f = fixture();
    const nativeSnapshot = {
      title: 'stored ciphertext',
      external_updated_at: null,
    };
    const originalRpc = f.rpc.getMockImplementation()!;
    if (stale)
      f.rpc.mockImplementation(async (name, params) =>
        params.p_action === 'admit'
          ? ({
              data: null,
              error: {
                code: '40001',
                message: 'Provider saga native snapshot changed',
              },
            } as never)
          : originalRpc(name, params)
      );
    const service = await createRequestProviderSagaService(
      new Request('https://synthetic.invalid'),
      scope.wsId,
      scope.eventId,
      { provider: () => f.provider, project: vi.fn() }
    );
    const pending = service.reserve({
      binding: {
        ...f.input.binding,
        mode: 'insert',
        source: {
          provider: 'tuturuuu',
          wsId: scope.wsId,
          eventId: scope.eventId,
          workspaceCalendarId: null,
        },
      },
      payload: f.input.payload,
      nativeSnapshot,
    });
    if (stale)
      await expect(pending).rejects.toMatchObject({ reason: 'conflict' });
    else expect(await pending).toMatchObject({ phase: 'prepared' });
    const admitted = f.rpc.mock.calls.find(
      ([, params]) => params.p_action === 'admit'
    )?.[1].p_input;
    expect(admitted.nativeSnapshot).toEqual(nativeSnapshot);
    expect(JSON.stringify(admitted.prepared)).not.toContain(
      'stored ciphertext'
    );
    expect(admitted.prepared).not.toHaveProperty('nativeSnapshot');
    expect(f.provider.observe).not.toHaveBeenCalled();
    expect(f.provider.insert).not.toHaveBeenCalled();
    expect(f.provider.move).not.toHaveBeenCalled();
    expect(f.provider.deleteSource).not.toHaveBeenCalled();
  }
);

it.each([
  { recurrence: ['RRULE:FREQ=DAILY'] },
  { recurringEventId: 'series' },
  { originalStartTime: { date: '2026-10-02' } },
])(
  'rejects recurring native transfers without deleting the source',
  async (recurrence) => {
    const f = fixture();
    vi.mocked(f.provider.observe).mockResolvedValueOnce({
      absent: false,
      eventId: 'original',
      etag: 'original-version',
      marker: null,
      event: {
        id: 'original',
        etag: 'original-version',
        start: { date: '2026-10-02' },
        end: { date: '2026-10-03' },
        ...recurrence,
      },
    });
    const service = await createRequestProviderSagaService(
      new Request('https://example.test'),
      scope.wsId,
      scope.eventId,
      { provider: () => f.provider, project: vi.fn() }
    );
    await expect(
      service.reserve({
        ...f.input,
        binding: {
          ...f.input.binding,
          mode: 'external-to-native',
          destination: {
            provider: 'tuturuuu',
            wsId: scope.wsId,
            eventId: scope.eventId,
            workspaceCalendarId: '00000000-0000-4000-8000-000000008791',
          },
        },
      })
    ).rejects.toMatchObject({ reason: 'unavailable' });
    expect(f.provider.deleteSource).not.toHaveBeenCalled();
  }
);
