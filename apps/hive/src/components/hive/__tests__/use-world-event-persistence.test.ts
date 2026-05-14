import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@/engine/world';
import {
  createWorldEventPersistence,
  type QueuedWorldEvent,
} from '../use-world-event-persistence';

const userId = '00000000-0000-4000-8000-000000000001';
const serverId = '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d';

function createHarness() {
  const world = createDefaultWorld();
  const createWorldEvent = {
    isPending: false,
    mutate: vi.fn(),
  };
  const refs = {
    conflictCooldownRef: { current: 0 },
    inFlightRef: { current: false },
    queuedEventRef: { current: null as QueuedWorldEvent | null },
    revisionRef: { current: 7 },
  };
  const state = {
    setNpcs: vi.fn(),
    setRevision: vi.fn(),
    setSyncNotice: vi.fn(),
    setWorld: vi.fn(),
  };

  const persistWorld = createWorldEventPersistence({
    createWorldEvent,
    currentUserId: userId,
    serverId,
    snapshotQuery: {
      refetch: vi.fn().mockResolvedValue({
        data: {
          npcs: [],
          revision: 8,
          world,
        },
      }),
    },
    tool: 'build',
    ...refs,
    ...state,
  });

  return { createWorldEvent, persistWorld, refs, state, world };
}

describe('createWorldEventPersistence', () => {
  it('queues the latest world event while a save is pending', () => {
    const { createWorldEvent, persistWorld, refs, state, world } =
      createHarness();
    const queuedWorld = { ...world, blocks: world.blocks.slice(0, 1) };
    createWorldEvent.isPending = true;

    persistWorld(queuedWorld, 'block.place', { blockId: 'block-1' });

    expect(createWorldEvent.mutate).not.toHaveBeenCalled();
    expect(refs.queuedEventRef.current).toEqual({
      eventType: 'block.place',
      nextWorld: queuedWorld,
      payload: { blockId: 'block-1' },
    });
    expect(state.setSyncNotice).toHaveBeenCalledWith(
      'Saving latest world edit after current save.'
    );
  });

  it('flushes a queued world event after the active save succeeds', () => {
    const { createWorldEvent, persistWorld, refs, state, world } =
      createHarness();
    const queuedWorld = { ...world, blocks: world.blocks.slice(0, 1) };

    persistWorld(world, 'block.place', { blockId: 'block-1' });
    refs.queuedEventRef.current = {
      eventType: 'object.place',
      nextWorld: queuedWorld,
      payload: { objectId: 'object-1' },
    };

    const mutateOptions = createWorldEvent.mutate.mock.calls[0]?.[1];
    mutateOptions.onSuccess({ event: { id: 'event-1' } as never, revision: 8 });

    expect(createWorldEvent.mutate).toHaveBeenCalledTimes(2);
    expect(createWorldEvent.mutate.mock.calls[1]?.[0]).toMatchObject({
      eventType: 'object.place',
      expectedRevision: 8,
      payload: {
        actor: userId,
        objectId: 'object-1',
        tool: 'build',
      },
      world: queuedWorld,
    });
    expect(refs.queuedEventRef.current).toBeNull();
    expect(state.setSyncNotice).toHaveBeenCalledWith(
      'Saving latest world edit.'
    );
  });

  it('reloads after a failed save without immediately retrying the mutation', async () => {
    const { createWorldEvent, persistWorld, refs, state, world } =
      createHarness();

    persistWorld(world, 'block.place');

    const mutateOptions = createWorldEvent.mutate.mock.calls[0]?.[1];
    await mutateOptions.onError();

    expect(createWorldEvent.mutate).toHaveBeenCalledTimes(1);
    expect(refs.conflictCooldownRef.current).toBeGreaterThan(Date.now());
    expect(state.setRevision).toHaveBeenCalledWith(8);
    expect(state.setSyncNotice).toHaveBeenCalledWith(
      'World changed remotely. Reloaded the latest state.'
    );
  });
});
