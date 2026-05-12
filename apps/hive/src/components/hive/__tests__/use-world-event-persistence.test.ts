import { describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '@/engine/world';
import { createWorldEventPersistence } from '../use-world-event-persistence';

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
  it('does not submit another world event while a save is pending', () => {
    const { createWorldEvent, persistWorld, state, world } = createHarness();
    createWorldEvent.isPending = true;

    persistWorld(world, 'block.place');

    expect(createWorldEvent.mutate).not.toHaveBeenCalled();
    expect(state.setSyncNotice).toHaveBeenCalledWith(
      'Saving the previous world edit before sending another.'
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
