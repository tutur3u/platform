import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  applyWorldToHiveDoc,
  base64ToBytes,
  bytesToBase64,
  encodeHiveWorldUpdate,
  hiveRealtimeAwarenessSchema,
  mergeHiveCrdtUpdate,
  worldFromHiveDoc,
} from './index';

const baseWorld = {
  blocks: [
    {
      id: 'soil-0-0',
      position: { x: 0, y: 0, z: 0 },
      state: { color: '#7cba62' },
      type: 'soil',
    },
  ],
  objects: [],
};

describe('@tuturuuu/realtime Hive CRDT helpers', () => {
  it('encodes and merges commutative Hive world updates', () => {
    const first = encodeHiveWorldUpdate(baseWorld);
    const second = encodeHiveWorldUpdate({
      blocks: [
        ...baseWorld.blocks,
        {
          id: 'soil-1-0',
          position: { x: 1, y: 0, z: 0 },
          state: { accentColor: '#65a5d8' },
          type: 'soil',
        },
      ],
      objects: [
        {
          id: 'turnip-1-0',
          position: { x: 1, y: 1, z: 0 },
          state: { growthStage: 1, needsWater: true },
          type: 'crop',
        },
      ],
    });

    const merged = mergeHiveCrdtUpdate({
      currentState: first.state,
      fallbackWorld: baseWorld,
      update: second.update,
    });

    expect(merged.world.blocks.map((block) => block.id).sort()).toEqual([
      'soil-0-0',
      'soil-1-0',
    ]);
    expect(merged.world.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'soil-0-0',
          state: { color: '#7cba62' },
        }),
        expect.objectContaining({
          id: 'soil-1-0',
          state: { accentColor: '#65a5d8' },
        }),
      ])
    );
    expect(merged.world.objects).toHaveLength(1);
    expect(merged.stateVector.byteLength).toBeGreaterThan(0);
  });

  it('round-trips binary updates through base64 protocol payloads', () => {
    const update = encodeHiveWorldUpdate(baseWorld).update;
    expect(base64ToBytes(bytesToBase64(update))).toEqual(update);
  });

  it('keeps awareness valid and separate from durable world state', () => {
    const parsed = hiveRealtimeAwarenessSchema.parse({
      activeTool: 'build',
      color: '#16a34a',
      cursor: { x: 1, y: 0, z: 2 },
      displayName: 'Researcher',
      lastSeenAt: '2026-05-13T00:00:00.000Z',
      userId: '00000000-0000-4000-8000-000000000001',
      worldPosition: { x: 1, y: 1, z: 2 },
    });
    const doc = new Y.Doc();
    applyWorldToHiveDoc(doc, baseWorld);

    expect(parsed.role).toBe('member');
    expect(worldFromHiveDoc(doc)).toEqual(baseWorld);
  });
});
