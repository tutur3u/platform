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
    <div className="pointer-events-auto rounded-lg border border-zinc-200/80 bg-white/86 px-4 py-3 text-zinc-900 shadow-lg shadow-zinc-900/10 backdrop-blur-md">
      <p className="font-semibold text-sm">
        {server?.name ?? 'No server selected'}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {world.blocks.length} blocks / {world.objects.length} objects /{' '}
        {npcs.length} NPCs
      </p>
    </div>
  );
}
