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

describe('Hive realtime protocol', () => {
  it('accepts web-api-applied world event broadcasts', () => {
    expect(
      hiveRealtimeClientMessageSchema.safeParse({
        event,
        type: 'world.event.applied',
        world,
      }).success
    ).toBe(true);
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
});
