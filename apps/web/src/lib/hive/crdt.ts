import 'server-only';
import { mergeHiveCrdtUpdate as mergeSharedHiveCrdtUpdate } from '@tuturuuu/realtime/hive';

export function mergeHiveCrdtUpdate(args: {
  currentState?: Buffer | Uint8Array | null;
  update: Buffer | Uint8Array;
  fallbackWorld?: Parameters<
    typeof mergeSharedHiveCrdtUpdate
  >[0]['fallbackWorld'];
}) {
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
