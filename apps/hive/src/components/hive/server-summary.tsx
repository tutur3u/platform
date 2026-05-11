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
    <div className="pointer-events-auto rounded-lg border border-border/70 bg-background/88 px-4 py-3 text-foreground shadow-foreground/10 shadow-lg backdrop-blur-md">
      <p className="font-semibold text-sm">
        {server?.name ?? 'No server selected'}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {world.blocks.length} blocks / {world.objects.length} objects /{' '}
        {npcs.length} NPCs
      </p>
    </div>
  );
}
