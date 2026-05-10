import type { HiveNpc, HiveServer, HiveWorldData } from '@/engine/types';

export function ServerSummary({
  npcs,
  server,
  world,
}: {
  npcs: HiveNpc[];
  server?: HiveServer | null;
  world: HiveWorldData;
}) {
  return (
    <div className="absolute top-4 left-4 z-10 rounded border border-zinc-800 bg-zinc-950/88 px-4 py-3 backdrop-blur">
      <p className="font-semibold text-sm text-zinc-100">
        {server?.name ?? 'No server selected'}
      </p>
      <p className="text-xs text-zinc-500">
        {world.blocks.length} blocks / {world.objects.length} objects /{' '}
        {npcs.length} NPCs
      </p>
    </div>
  );
}
