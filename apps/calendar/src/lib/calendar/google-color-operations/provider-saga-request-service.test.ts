import { describe, expect, it, vi } from 'vitest';
import type {
  ProviderSagaAdapter,
  SagaEndpoint,
} from './provider-saga-protocol';
import { createRequestProviderSagaService } from './provider-saga-request-service';

const mocks = vi.hoisted(() => ({
  authorization: vi.fn(),
  assertAllowed: vi.fn(),
}));
vi.mock('./provider-saga-request-access', () => ({
  createRequestProviderSagaAccess: () => mocks,
}));
vi.mock('../../workspace-encryption', () => ({
  getWorkspaceKey: async () => Buffer.alloc(32, 8),
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
  const rpc = vi.fn(async (_name, params) =>
    params.p_action === 'inspect'
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
    expect(f.rpc.mock.calls[1]?.[1].p_input.expectedGeneration).toBe(
      '9007199254740993'
    );
  });
  it('blocks a pending cross-kind generation before source GET or key lookup', async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({
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
  });
  it('does not refresh original provider version when a competing admission wins', async () => {
    const f = fixture();
    f.rpc
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
