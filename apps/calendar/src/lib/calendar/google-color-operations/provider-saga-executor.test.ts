import { describe, expect, it, vi } from 'vitest';
import { ColorOperationError } from './protocol';
import { createProviderSagaCodec } from './provider-saga-codec';
import {
  createProviderSagaExecutor,
  type ProviderSagaOperation,
  type ProviderSagaRepository,
} from './provider-saga-executor';
import type {
  ProviderSagaAdapter,
  SagaBinding,
  SagaEndpoint,
  SagaObservation,
} from './provider-saga-protocol';

vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));
const id = '00000000-0000-4000-8000-000000008751';
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
    calendarId: 'old-calendar',
    providerEventId: 'original-event',
  },
};
const destination: SagaEndpoint = {
  provider: 'google',
  workspaceCalendarId: null,
  identity: {
    ...scope,
    connectionId: '00000000-0000-4000-8000-000000008732',
    calendarId: 'new-calendar',
    providerEventId: 'tt00000000000040008000000000008751',
  },
};
const target: SagaObservation = {
  absent: false,
  eventId: destination.identity.providerEventId!,
  etag: 'target-original',
  marker: id,
  event: { summary: 'Synthetic authoritative target' },
};
async function fixture(create = false) {
  const binding: SagaBinding = {
    operationId: id,
    generation: '9007199254740993',
    action: create ? 'create' : 'move',
    mode: create ? 'insert' : 'copy-delete',
    source: create ? null : source,
    destination,
    baseETag: create ? null : 'source-original',
  };
  const access = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const codec = createProviderSagaCodec({
    access,
    getKey: async () => Buffer.alloc(32, 8),
  });
  let current: ProviderSagaOperation = {
    id,
    generation: binding.generation,
    phase: 'prepared',
    checkpoint: null,
    prepared: {
      binding,
      journal: await codec.seal(binding, {
        event: { summary: 'Synthetic intended body' },
        localPatch: { locked: true },
        sendUpdates: 'all',
      }),
    },
  };
  const repository: ProviderSagaRepository = {
    read: vi.fn(async () => current),
    dispatch: vi.fn(async () => {
      current = { ...current, phase: 'dispatched' };
      return current;
    }),
    checkpoint: vi.fn(async (_operation, checkpoint) => {
      current = { ...current, checkpoint };
      return current;
    }),
    finalize: vi.fn(async (_operation, completion) => {
      current = { ...current, phase: completion.outcome };
      return current;
    }),
    cancel: vi.fn(async () => {
      current = { ...current, phase: 'canceled' };
      return current;
    }),
  };
  const provider: ProviderSagaAdapter = {
    insert: vi.fn().mockResolvedValue(target),
    move: vi.fn().mockResolvedValue(target),
    observe: vi.fn(async (_binding, endpoint) =>
      endpoint === source ? { absent: true as const } : target
    ),
    deleteSource: vi.fn().mockResolvedValue(undefined),
    removeTarget: vi.fn().mockResolvedValue(undefined),
  };
  return {
    binding,
    access,
    codec,
    repository,
    provider,
    state: () => current,
    executor: createProviderSagaExecutor({
      access,
      codec,
      repository,
      provider,
    }),
  };
}
describe('durable dual-endpoint provider saga', () => {
  it('checkpoints target before deleting original and finalizes only authoritative target state', async () => {
    const f = await fixture();
    await expect(f.executor.execute(id)).resolves.toMatchObject({
      phase: 'applied',
    });
    expect(f.repository.checkpoint).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      {
        step: 'target-created',
        targetEventId: target.absent ? '' : target.eventId,
        targetETag: 'target-original',
      }
    );
    expect(f.provider.deleteSource).toHaveBeenCalledWith(
      f.binding,
      expect.objectContaining({ sendUpdates: 'all' })
    );
    expect(f.repository.finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: 'applied',
        observation: target,
        localPatch: { locked: true },
      })
    );
  });
  it('retries an ambiguous source delete without reinserting target or refreshing either ETag', async () => {
    const f = await fixture();
    vi.mocked(f.provider.deleteSource).mockRejectedValueOnce(
      new Error('Synthetic network ambiguity')
    );
    await expect(f.executor.execute(id)).rejects.toThrow(
      'Synthetic network ambiguity'
    );
    expect(f.state()).toMatchObject({
      phase: 'dispatched',
      checkpoint: { step: 'target-created', targetETag: 'target-original' },
    });
    await f.executor.execute(id);
    expect(f.provider.insert).toHaveBeenCalledTimes(1);
    for (const [binding] of vi.mocked(f.provider.deleteSource).mock.calls)
      expect(binding.baseETag).toBe('source-original');
  });
  it('compensates only the captured target version when original source was concurrently changed', async () => {
    const f = await fixture();
    const latest = {
      absent: false as const,
      eventId: 'original-event',
      etag: 'new-source-version',
      marker: null,
      event: { summary: 'Synthetic external edit' },
    };
    vi.mocked(f.provider.deleteSource).mockRejectedValueOnce(
      new ColorOperationError('conflict', 'Source changed')
    );
    vi.mocked(f.provider.observe).mockImplementation(
      async (_binding, endpoint) =>
        endpoint === source ? latest : { absent: true as const }
    );
    await expect(f.executor.execute(id)).resolves.toMatchObject({
      phase: 'superseded',
    });
    expect(f.provider.removeTarget).toHaveBeenCalledWith(f.binding, {
      step: 'target-created',
      targetEventId: destination.identity.providerEventId,
      targetETag: 'target-original',
    });
    expect(f.repository.finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: 'superseded',
        observation: latest,
        localPatch: {},
      })
    );
  });
  it('retains the dispatched generation if safe compensation is no longer possible', async () => {
    const f = await fixture();
    vi.mocked(f.provider.deleteSource).mockRejectedValueOnce(
      new ColorOperationError('conflict', 'Source changed')
    );
    vi.mocked(f.provider.observe).mockResolvedValueOnce({
      absent: false,
      eventId: 'original-event',
      etag: 'new-source',
      marker: null,
      event: {},
    });
    vi.mocked(f.provider.removeTarget).mockRejectedValueOnce(
      new ColorOperationError('conflict', 'Target changed')
    );
    await expect(f.executor.execute(id)).rejects.toMatchObject({
      reason: 'conflict',
    });
    expect(f.state().phase).toBe('dispatched');
    expect(f.repository.finalize).not.toHaveBeenCalled();
  });
  it('rejects a foreign target marker before deleting source', async () => {
    const f = await fixture();
    vi.mocked(f.provider.insert).mockResolvedValueOnce({
      ...target,
      absent: false,
      marker: 'other-operation',
    });
    await expect(f.executor.execute(id)).rejects.toMatchObject({
      reason: 'identity',
    });
    expect(f.provider.deleteSource).not.toHaveBeenCalled();
    expect(f.repository.finalize).not.toHaveBeenCalled();
  });
  it('reauthorizes recovery before any network effect', async () => {
    const f = await fixture();
    f.access.assertAllowed.mockRejectedValueOnce(
      new ColorOperationError('unauthorized', 'Revoked')
    );
    await expect(f.executor.execute(id)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    expect(f.provider.insert).not.toHaveBeenCalled();
  });
  it('creation finalizes its deterministic target without deleting any existing source', async () => {
    const f = await fixture(true);
    await expect(f.executor.execute(id)).resolves.toMatchObject({
      phase: 'applied',
    });
    expect(f.provider.deleteSource).not.toHaveBeenCalled();
  });
});

it('keeps compensated source absence pending until an atomic tombstone contract exists', async () => {
  const f = await fixture();
  f.state().phase = 'dispatched';
  f.state().checkpoint = {
    step: 'target-removed',
    targetEventId: destination.identity.providerEventId!,
    targetETag: 'target-original',
  };
  vi.mocked(f.provider.observe).mockResolvedValue({ absent: true });
  await expect(f.executor.execute(id)).rejects.toMatchObject({
    reason: 'unavailable',
  });
  expect(f.repository.finalize).not.toHaveBeenCalled();
  expect(f.provider.insert).not.toHaveBeenCalled();
  expect(f.provider.deleteSource).not.toHaveBeenCalled();
  expect(f.state().phase).toBe('dispatched');
});
