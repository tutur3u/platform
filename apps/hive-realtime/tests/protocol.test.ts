import { describe, expect, it } from 'vitest';
import { hiveRealtimeClientMessageSchema } from '../src/protocol';

const event = {
  actorUserId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-05-12T00:00:00.000Z',
  eventType: 'block.remove',
  id: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
  payload: { erasedId: 'grass-0-0' },
  revision: 2,
  serverId: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
};

const world = {
  blocks: [
    {
      id: 'grass-1-0',
      position: { x: 1, y: 0, z: 0 },
      type: 'grass',
    },
  ],
  objects: [],
};

const worldWithOversizedFootprint = {
  blocks: [],
  objects: [
    {
      id: 'object:malicious:seed',
      position: { x: 0, y: 1, z: 0 },
      state: {
        footprint: {
          depth: 1_000_000,
          width: 1_000_000,
        },
      },
      type: 'custom',
    },
  ],
};

describe('Hive realtime protocol', () => {
  it('accepts CRDT update messages with optional world projections', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        stateVector: 'AQID',
        type: 'sync.update',
        update: 'BAUG',
        world,
      }).success
    ).toBe(true);
  });

  it('accepts ephemeral awareness without persisting it into world data', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        awareness: {
          activeTool: 'build',
          color: '#16a34a',
          cursor: { x: 1, y: 0, z: 0 },
          displayName: 'Researcher',
          lastSeenAt: '2026-05-13T00:00:00.000Z',
          role: 'researcher',
          userId: '00000000-0000-4000-8000-000000000002',
          worldPosition: { x: 1, y: 1, z: 0 },
        },
        type: 'awareness.update',
      }).success
    ).toBe(true);
  });

  it('rejects client-supplied applied world event broadcasts', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        event,
        type: 'world.event.applied',
        world,
      }).success
    ).toBe(false);
  });

  it('rejects malformed applied event snapshots', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        event,
        type: 'world.event.applied',
        world: { blocks: [{ id: '' }], objects: [] },
      }).success
    ).toBe(false);
  });

  it('rejects oversized world footprint projections from clients', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        stateVector: 'AQID',
        type: 'sync.update',
        update: 'BAUG',
        world: worldWithOversizedFootprint,
      }).success
    ).toBe(false);

    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        eventType: 'object.update',
        expectedRevision: 2,
        payload: {},
        type: 'world.event',
        world: worldWithOversizedFootprint,
      }).success
    ).toBe(false);
  });
});
