import { Buffer } from 'node:buffer';
import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import {
  createGoogleMutationExecutor,
  type GoogleMutationCompletion,
  type GoogleMutationOperation,
  type GoogleMutationRepository,
} from './mutation-executor';
import { createGoogleMutationProvider } from './mutation-provider';
import { COLOR_OPERATION_MARKER } from './protocol';
import { createSealedMutationCodec } from './sealed-mutation';

vi.mock('../../workspace-encryption', () => ({ getWorkspaceKey: vi.fn() }));
const identity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: 'calendar',
  providerEventId: 'provider-event',
};
const id = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const access = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const codec = createSealedMutationCodec({
    access,
    getKey: async () => Buffer.alloc(32, 17),
  });
  const get = vi.fn().mockResolvedValue({
    data: {
      etag: 'opaque-base',
      summary: 'before',
      extendedProperties: { private: { unrelated: 'retained' } },
    },
  });
  const patch = vi.fn().mockResolvedValue({ data: {} });
  const remove = vi.fn().mockResolvedValue({ data: {} });
  const calendarGet = vi
    .fn()
    .mockResolvedValue({ data: { accessRole: 'writer' } });
  const resolve = vi.fn().mockResolvedValue({
    events: { get, patch, delete: remove },
    calendarList: { get: calendarGet },
  } as unknown as calendar_v3.Calendar);
  const provider = createGoogleMutationProvider({ access, resolve, codec });
  async function prepare(action: 'patch' | 'delete' = 'patch') {
    return provider.prepare({
      operationId: id,
      generation: '1',
      identity,
      action,
      providerPatch: {
        summary: 'Private updated title',
        description: 'Private description',
        location: 'Private location',
      },
      localPatch: { locked: false },
    });
  }
  return {
    access,
    codec,
    get,
    patch,
    remove,
    calendarGet,
    resolve,
    provider,
    prepare,
  };
}
function repository(initial: GoogleMutationOperation) {
  let current = initial;
  const completions: GoogleMutationCompletion[] = [];
  const repo: GoogleMutationRepository = {
    admit: vi.fn(async (operation) => {
      current = operation;
      return current;
    }),
    read: vi.fn(async () => current),
    markDispatched: vi.fn(async (operation) => {
      if (current.phase !== 'prepared' && current.phase !== 'dispatched')
        throw new Error('canceled');
      current = { ...operation, phase: 'dispatched' };
      return current;
    }),
    finalize: vi.fn(async (operation, completion) => {
      if (current.phase === 'dispatched') {
        completions.push(completion);
        current = { ...operation, phase: completion.outcome };
      }
      return current;
    }),
    cancelUnsent: vi.fn(async () => {
      if (current.phase !== 'prepared') throw new Error('sent');
      current = { ...current, phase: 'canceled' };
      return current;
    }),
  };
  return { repo, completions, state: () => current };
}
async function executorFixture(action: 'patch' | 'delete' = 'patch') {
  const f = fixture();
  const prepared = await f.prepare(action);
  const r = repository({
    id,
    generation: '1',
    identity,
    phase: 'prepared',
    prepared,
  });
  return {
    ...f,
    ...r,
    executor: createGoogleMutationExecutor({
      access: f.access,
      provider: f.provider,
      repository: r.repo,
    }),
  };
}
describe('encrypted immutable generic Google mutations', () => {
  it('persists no sensitive request content and preserves the server marker plus existing private properties', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    expect(JSON.stringify(prepared)).not.toContain('Private');
    const payload = await f.codec.open(prepared.binding, prepared.journal);
    expect(payload.providerPatch.extendedProperties).toEqual({
      private: { unrelated: 'retained', [COLOR_OPERATION_MARKER]: id },
    });
    expect(payload.localPatch).toEqual({ locked: false });
  });
  it('replays exactly the original If-Match even after a newer provider read', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    await f.provider.dispatch(identity, prepared);
    f.get.mockResolvedValue({ data: { etag: 'newer-provider' } });
    await f.provider.observe(identity);
    await f.provider.dispatch(identity, prepared);
    expect(f.patch).toHaveBeenCalledTimes(2);
    for (const call of f.patch.mock.calls)
      expect(call[1]).toEqual({ headers: { 'If-Match': 'opaque-base' } });
    expect(f.patch.mock.calls[0]?.[0].requestBody.summary).toBe(
      'Private updated title'
    );
  });
  it('preserves the immutable notification policy for ordinary content writes on every retry', async () => {
    const f = fixture();
    const prepared = await f.provider.prepare({
      operationId: id,
      generation: '1',
      identity,
      action: 'patch',
      providerPatch: { summary: 'Content update' },
      sendUpdates: 'all',
    });
    await f.provider.dispatch(identity, prepared);
    await f.provider.dispatch(identity, prepared);
    for (const call of f.patch.mock.calls)
      expect(call[0].sendUpdates).toBe('all');
  });
  it('seals the native palette protocol version for every immutable replay', async () => {
    const f = fixture();
    const prepared = await f.provider.prepare({
      operationId: id,
      generation: '1',
      identity,
      action: 'patch',
      providerPatch: { colorId: '11', eventLabelId: '' },
      sendUpdates: 'none',
      eventLabelVersion: 0,
    });
    await f.provider.dispatch(identity, prepared);
    await f.provider.dispatch(identity, prepared);
    for (const call of f.patch.mock.calls)
      expect(call[0].eventLabelVersion).toBe(0);
  });
  it('reauthorizes a replay and never dispatches a tampered journal', async () => {
    const f = fixture();
    const prepared = await f.prepare();
    await expect(
      f.provider.dispatch(identity, {
        ...prepared,
        journal: { version: 1, ciphertext: 'invalid' },
      })
    ).rejects.toThrow('Encrypted Google mutation');
    f.access.assertAllowed.mockRejectedValue(new Error('revoked'));
    await expect(f.provider.dispatch(identity, prepared)).rejects.toThrow(
      'revoked'
    );
    expect(f.patch).not.toHaveBeenCalled();
  });
  it('uses conditional deletion with no plaintext request body', async () => {
    const f = fixture();
    const prepared = await f.prepare('delete');
    await f.provider.dispatch(identity, prepared);
    expect(f.remove).toHaveBeenCalledWith(
      {
        calendarId: 'calendar',
        eventId: 'provider-event',
        sendUpdates: 'none',
      },
      { headers: { 'If-Match': 'opaque-base' } }
    );
    expect(f.patch).not.toHaveBeenCalled();
  });
  it('does not interpret a permission-masked 404 as a deleted event', async () => {
    const f = fixture();
    f.get.mockRejectedValue({ code: 404 });
    f.calendarGet.mockResolvedValue({ data: { accessRole: 'reader' } });
    await expect(f.provider.observe(identity)).rejects.toThrow(
      'Google calendar access unavailable'
    );
    f.calendarGet.mockResolvedValue({ data: { accessRole: 'writer' } });
    await expect(f.provider.observe(identity)).resolves.toEqual({
      deleted: true,
    });
  });
  it('rejects arbitrary provider fields before fetching or sealing', async () => {
    const f = fixture();
    await expect(
      f.provider.prepare({
        operationId: id,
        generation: '1',
        identity,
        action: 'patch',
        providerPatch: { id: 'injected' },
      })
    ).rejects.toThrow();
    expect(f.get).not.toHaveBeenCalled();
  });
});
describe('durable mutation crash recovery', () => {
  it('records dispatch before network effects and projects authoritative content after a precondition conflict', async () => {
    const f = await executorFixture();
    f.patch.mockImplementation(async () => {
      expect(f.state().phase).toBe('dispatched');
      throw { code: 412 };
    });
    f.get.mockResolvedValue({
      data: {
        etag: 'external-new',
        summary: 'Newer external title',
        extendedProperties: {
          private: { [COLOR_OPERATION_MARKER]: 'external' },
        },
      },
    });
    expect((await f.executor.execute(identity, id)).phase).toBe('superseded');
    expect(f.completions).toEqual([
      {
        deleted: false,
        outcome: 'superseded',
        event: {
          etag: 'external-new',
          summary: 'Newer external title',
          extendedProperties: {
            private: { [COLOR_OPERATION_MARKER]: 'external' },
          },
        },
        localPatch: {},
      },
    ]);
  });
  it('keeps a failed read pending and resumes using the original sealed request', async () => {
    const f = await executorFixture();
    f.get.mockRejectedValueOnce(new Error('timeout'));
    await expect(f.executor.execute(identity, id)).rejects.toThrow('timeout');
    expect(f.state().phase).toBe('dispatched');
    await expect(f.executor.cancel(identity, id)).rejects.toThrow('sent');
    f.patch.mockRejectedValue({ response: { status: 412 } });
    f.get.mockResolvedValue({
      data: {
        etag: 'applied',
        summary: 'Authoritative title',
        extendedProperties: { private: { [COLOR_OPERATION_MARKER]: id } },
      },
    });
    expect((await f.executor.execute(identity, id)).phase).toBe('applied');
    expect(f.completions[0]).toMatchObject({
      outcome: 'applied',
      localPatch: { locked: false },
      event: { summary: 'Authoritative title' },
    });
    expect(f.patch.mock.calls[1]?.[1]).toEqual({
      headers: { 'If-Match': 'opaque-base' },
    });
  });
  it('does not finalize if the provider version has not advanced', async () => {
    const f = await executorFixture();
    await expect(f.executor.execute(identity, id)).rejects.toThrow(
      'not fenced'
    );
    expect(f.repo.finalize).not.toHaveBeenCalled();
    expect(f.state().phase).toBe('dispatched');
  });
  it('finalizes a confirmed delete tombstone while retaining the dispatched operation identity', async () => {
    const f = await executorFixture('delete');
    f.remove.mockRejectedValue({ code: 404 });
    f.get.mockRejectedValue({ code: 404 });
    expect((await f.executor.execute(identity, id)).phase).toBe('applied');
    expect(f.completions).toEqual([{ deleted: true, outcome: 'applied' }]);
  });
  it('projects external deletion as supersession of a patch, without restoring the old body', async () => {
    const f = await executorFixture();
    f.patch.mockRejectedValue({ code: 412 });
    f.get.mockResolvedValue({ data: { status: 'cancelled' } });
    expect((await f.executor.execute(identity, id)).phase).toBe('superseded');
    expect(f.completions).toEqual([{ deleted: true, outcome: 'superseded' }]);
  });
  it('never sends an operation canceled before dispatch', async () => {
    const f = await executorFixture();
    await f.executor.cancel(identity, id);
    expect((await f.executor.execute(identity, id)).phase).toBe('canceled');
    expect(f.patch).not.toHaveBeenCalled();
  });
  it('rejects a repository record with a different generation binding before dispatch', async () => {
    const f = await executorFixture();
    f.repo.read = vi.fn(async () => ({ ...f.state(), generation: '2' }));
    await expect(f.executor.execute(identity, id)).rejects.toThrow(
      'identity changed'
    );
    expect(f.patch).not.toHaveBeenCalled();
  });
});
