import 'server-only';
import type { HiveRealtimeWorld } from '@tuturuuu/realtime/hive';

export async function mergeHiveCrdtUpdate(args: {
  currentState?: Buffer | Uint8Array | null;
  update: Buffer | Uint8Array;
  fallbackWorld?: HiveRealtimeWorld | null;
}) {
  const { mergeHiveCrdtUpdate: mergeSharedHiveCrdtUpdate } = await import(
    '@tuturuuu/realtime/hive/yjs'
  );
  const merged = mergeSharedHiveCrdtUpdate({
    currentState: args.currentState ? new Uint8Array(args.currentState) : null,
    fallbackWorld: args.fallbackWorld,
    update: new Uint8Array(args.update),
  });
  return {
    state: Buffer.from(merged.state),
    stateVector: Buffer.from(merged.stateVector),
    world: merged.world,
  };
}
