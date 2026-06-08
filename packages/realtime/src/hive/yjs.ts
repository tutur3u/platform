import * as Y from 'yjs';
import type { HiveRealtimeWorld } from './index';

function upsertMap<T extends { id: string }>(map: Y.Map<T>, items: T[]) {
  const nextIds = new Set(items.map((item) => item.id));

  for (const key of Array.from(map.keys())) {
    if (!nextIds.has(key)) map.delete(key);
  }

  for (const item of items) {
    map.set(item.id, item);
  }
}

export function applyWorldToHiveDoc(doc: Y.Doc, world: HiveRealtimeWorld) {
  const blocks = doc.getMap<HiveRealtimeWorld['blocks'][number]>('blocks');
  const objects = doc.getMap<HiveRealtimeWorld['objects'][number]>('objects');

  doc.transact(() => {
    upsertMap(blocks, world.blocks);
    upsertMap(objects, world.objects);
  }, 'hive-world-sync');
}

export function worldFromHiveDoc(doc: Y.Doc): HiveRealtimeWorld {
  return {
    blocks: Array.from(
      doc.getMap<HiveRealtimeWorld['blocks'][number]>('blocks').values()
    ),
    objects: Array.from(
      doc.getMap<HiveRealtimeWorld['objects'][number]>('objects').values()
    ),
  };
}

export function encodeHiveWorldUpdate(world: HiveRealtimeWorld) {
  const doc = new Y.Doc();
  applyWorldToHiveDoc(doc, world);
  return {
    state: Y.encodeStateAsUpdate(doc),
    stateVector: Y.encodeStateVector(doc),
    update: Y.encodeStateAsUpdate(doc),
    world: worldFromHiveDoc(doc),
  };
}

export function mergeHiveCrdtUpdate(args: {
  currentState?: Uint8Array | null;
  fallbackWorld?: HiveRealtimeWorld | null;
  update: Uint8Array;
}) {
  const doc = new Y.Doc();

  if (args.currentState?.byteLength) {
    Y.applyUpdate(doc, args.currentState);
  } else if (args.fallbackWorld) {
    applyWorldToHiveDoc(doc, args.fallbackWorld);
  }

  Y.applyUpdate(doc, args.update);

  return {
    state: Y.encodeStateAsUpdate(doc),
    stateVector: Y.encodeStateVector(doc),
    world: worldFromHiveDoc(doc),
  };
}
