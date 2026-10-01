import { describe, expect, it, vi } from 'vitest';
import { createColorOperationExecutor } from './execute';
import {
  COLOR_OPERATION_MARKER,
  type ColorOperation,
  ColorOperationError,
  type ColorOperationIdentity,
  type ColorOperationProvider,
  type ColorOperationRepository,
  type PreparedColorPatch,
} from './protocol';

const identity: ColorOperationIdentity = {
  wsId: 'workspace',
  eventId: 'local',
  connectionId: 'connection',
  authTokenId: 'token',
  calendarId: 'calendar',
  providerEventId: 'google',
};
const initial = (): ColorOperation => ({
  id: 'A',
  generation: '1',
  requestHash: 'hash-A',
  identity,
  intent: { connectionId: 'connection', kind: 'event', id: '11' },
  phase: 'reserved',
  prepared: null,
});
const copy = <T>(value: T): T => structuredClone(value);
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** Atomic storage boundary double, shared by two independent executors.
 * Production SQL must independently prove these transactional contracts. */
function fixture() {
  let stored = initial();
  let etag = 'opaque:original';
  let marker: string | null = null;
  let color = '11';
  let metadata: Record<string, unknown> = { custom: { keep: true } };
  const attempts: PreparedColorPatch[] = [];
  let failFinalize = false;
  let failPatch = false;
  let allowed = true;
  let delayed: {
    entered: ReturnType<typeof barrier>;
    release: ReturnType<typeof barrier>;
  } | null = null;
  function active(operation: ColorOperation) {
    if (
      stored.id !== operation.id ||
      stored.generation !== operation.generation ||
      JSON.stringify(stored.identity) !== JSON.stringify(operation.identity)
    )
      throw new ColorOperationError('conflict', 'Operation superseded');
  }
  const repository: ColorOperationRepository = {
    async reserve(input) {
      if (
        input.expectedGeneration !== stored.generation ||
        ['reserved', 'prepared', 'dispatched'].includes(stored.phase)
      )
        throw new ColorOperationError('conflict', 'Operation in progress');
      stored = {
        ...stored,
        ...input,
        generation: String(Number(stored.generation) + 1),
        phase: 'reserved',
        prepared: null,
      };
      return copy(stored);
    },
    async read(source, operationId) {
      if (
        JSON.stringify(source) !== JSON.stringify(stored.identity) ||
        stored.id !== operationId
      )
        throw new ColorOperationError('identity', 'Operation identity changed');
      return copy(stored);
    },
    async prepare(operation, prepared) {
      active(operation);
      if (stored.phase === 'reserved')
        stored = { ...stored, phase: 'prepared', prepared: copy(prepared) };
      if (!stored.prepared)
        throw new ColorOperationError('conflict', 'Operation canceled');
      return copy(stored);
    },
    async markDispatched(operation) {
      active(operation);
      if (!['prepared', 'dispatched'].includes(stored.phase))
        throw new ColorOperationError('conflict', 'Operation cannot dispatch');
      stored.phase = 'dispatched';
      return copy(stored);
    },
    async finalize(operation, snapshot, outcome) {
      active(operation);
      if (failFinalize)
        throw new ColorOperationError('storage', 'Commit unavailable');
      if (['applied', 'superseded'].includes(stored.phase)) return copy(stored);
      if (stored.phase !== 'dispatched')
        throw new ColorOperationError('conflict', 'Operation cannot finalize');
      metadata = { ...metadata, ...snapshot.metadata };
      stored.phase = outcome;
      return copy(stored);
    },
    async cancelUnsent(operation) {
      active(operation);
      if (!['reserved', 'prepared'].includes(stored.phase))
        throw new ColorOperationError(
          'conflict',
          'Operation may have been sent'
        );
      stored.phase = 'canceled';
      return copy(stored);
    },
  };
  const provider: ColorOperationProvider = {
    async prepare(operation) {
      return {
        baseETag: etag,
        eventLabelVersion: 0,
        patch: {
          colorId:
            operation.intent.kind === 'inherit' ? '' : operation.intent.id,
          extendedProperties: { private: { unrelated: 'preserve' } },
        },
      };
    },
    async patch(_identity, prepared) {
      attempts.push(copy(prepared));
      if (delayed) {
        const current = delayed;
        delayed = null;
        current.entered.resolve();
        await current.release.promise;
      }
      if (failPatch) throw new Error('Provider unavailable');
      if (prepared.baseETag !== etag) throw { code: 412 };
      color = String(prepared.patch.colorId);
      marker = (
        prepared.patch.extendedProperties as { private: Record<string, string> }
      ).private[COLOR_OPERATION_MARKER]!;
      etag = `opaque:after:${marker}`;
    },
    isPreconditionFailure(error) {
      return (error as { code?: number })?.code === 412;
    },
    async read() {
      return {
        etag,
        operationMarker: marker,
        compatibilityColor: 'BLUE',
        metadata: { google_color: { color_id: color } },
      };
    },
  };
  const access = {
    assertAllowed: vi.fn(async () => {
      if (!allowed)
        throw new ColorOperationError('unauthorized', 'Access revoked');
    }),
  };
  const executor = () =>
    createColorOperationExecutor({ repository, provider, access });
  return {
    executor,
    repository,
    provider,
    access,
    attempts,
    state: () => copy(stored),
    metadata: () => copy(metadata),
    changeMetadata: () => {
      metadata = { ...metadata, concurrent: 'retain' };
    },
    failFinalize: (value: boolean) => {
      failFinalize = value;
    },
    failPatch: (value: boolean) => {
      failPatch = value;
    },
    revoke: () => {
      allowed = false;
    },
    external: (nextColor: string, nextMarker: string | null = null) => {
      color = nextColor;
      marker = nextMarker;
      etag = 'opaque:external';
    },
    delay: () => {
      delayed = { entered: barrier(), release: barrier() };
      return delayed;
    },
  };
}

describe('recoverable immutable color operation executor', () => {
  it('marks same-color writes and preserves unrelated private properties and metadata', async () => {
    const f = fixture();
    f.changeMetadata();
    expect((await f.executor().execute(identity, 'A')).phase).toBe('applied');
    expect(f.attempts[0]?.baseETag).toBe('opaque:original');
    expect(f.attempts[0]?.patch.extendedProperties).toEqual({
      private: {
        unrelated: 'preserve',
        [COLOR_OPERATION_MARKER]: 'A',
      },
    });
    expect(f.metadata()).toMatchObject({
      custom: { keep: true },
      concurrent: 'retain',
    });
  });
  it('keeps definitely-unsent state safely cancellable', async () => {
    const f = fixture();
    expect((await f.executor().cancel(identity, 'A')).phase).toBe('canceled');
    expect((await f.executor().execute(identity, 'A')).phase).toBe('canceled');
    expect(f.attempts).toHaveLength(0);
  });
  it('leaves persistent provider errors recoverable, then retries EXACT same patch/ETag', async () => {
    const f = fixture();
    f.failPatch(true);
    await expect(f.executor().execute(identity, 'A')).rejects.toThrow(
      'Provider unavailable'
    );
    expect(f.state().phase).toBe('dispatched');
    await expect(f.executor().cancel(identity, 'A')).rejects.toThrow(
      'may have been sent'
    );
    f.failPatch(false);
    await f.executor().execute(identity, 'A');
    expect(f.attempts[1]).toEqual(f.attempts[0]);
  });
  it('recovers a successful provider mutation after failed DB commit with conditional412', async () => {
    const f = fixture();
    f.failFinalize(true);
    await expect(f.executor().execute(identity, 'A')).rejects.toThrow(
      'Commit unavailable'
    );
    expect(f.state().phase).toBe('dispatched');
    f.failFinalize(false);
    expect((await f.executor().execute(identity, 'A')).phase).toBe('applied');
    expect(f.attempts[1]).toEqual(f.attempts[0]);
  });
  it('uses marker, not matching color, to recognize an external superseding mutation', async () => {
    const f = fixture();
    f.failPatch(true);
    await expect(f.executor().execute(identity, 'A')).rejects.toThrow();
    f.external('11');
    f.failPatch(false);
    expect((await f.executor().execute(identity, 'A')).phase).toBe(
      'superseded'
    );
    expect(f.attempts[1]?.baseETag).toBe('opaque:original');
  });
  it('two independent instances fence delayed A before successor B and reject late A local commit', async () => {
    const f = fixture();
    const delayed = f.delay();
    const old = f.executor().execute(identity, 'A');
    // Attach rejection handler immediately: this is a controlled late response.
    const oldResult = old.catch((error: unknown) => error);
    await delayed.entered.promise;
    const resumed = await f.executor().execute(identity, 'A');
    expect(resumed.phase).toBe('applied');
    await f.repository.reserve({
      id: 'B',
      identity,
      requestHash: 'hash-B',
      expectedGeneration: '1',
      intent: { connectionId: 'connection', kind: 'event', id: '7' },
    });
    await f.executor().execute(identity, 'B');
    f.changeMetadata();
    delayed.release.resolve();
    expect(await oldResult).toBeInstanceOf(ColorOperationError);
    expect(f.state()).toMatchObject({
      id: 'B',
      generation: '2',
      phase: 'applied',
    });
    expect(f.metadata()).toMatchObject({
      google_color: { color_id: '7' },
      concurrent: 'retain',
    });
    expect(f.attempts[0]).toEqual(f.attempts[1]);
  });
  it('rejects a competing new intent while the existing operation may still run', async () => {
    const f = fixture();
    const delayed = f.delay();
    const active = f.executor().execute(identity, 'A');
    await delayed.entered.promise;
    await expect(
      f.repository.reserve({
        id: 'B',
        identity,
        requestHash: 'hash-B',
        expectedGeneration: '1',
        intent: { connectionId: 'connection', kind: 'event', id: '7' },
      })
    ).rejects.toThrow('Operation in progress');
    delayed.release.resolve();
    await active;
  });
  it('reauthorizes recovery and rejects identity overrides without provider dispatch', async () => {
    const f = fixture();
    f.revoke();
    await expect(f.executor().execute(identity, 'A')).rejects.toThrow(
      'Access revoked'
    );
    expect(f.attempts).toHaveLength(0);
    const other = fixture();
    await expect(
      other.executor().execute({ ...identity, connectionId: 'forged' }, 'A')
    ).rejects.toThrow('identity changed');
    expect(other.attempts).toHaveLength(0);
  });
});
